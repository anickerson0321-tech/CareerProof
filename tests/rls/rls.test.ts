// Row Level Security: user A must never read or write user B's rows.
//
// Runs the real migrations in a throwaway database. Point RLS_DB_URL at any
// Postgres 15+ you can create databases on (default: local postgres on 5432;
// with the Supabase CLI stack use postgres://postgres:postgres@127.0.0.1:54322/postgres).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN_URL = process.env.RLS_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const ROOT = join(__dirname, "..", "..");
const dbName = `careerproof_rls_${Date.now()}`;

let admin: Client;
let db: Client;

const userA = randomUUID();
const userB = randomUUID();

function dbUrl(name: string): string {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Run `fn` inside a transaction as the given user (or anon), then roll back. */
async function as<T>(user: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    if (user) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: user, role: "authenticated" }),
      ]);
    } else {
      await db.query("set local role anon");
    }
    return await fn(db);
  } finally {
    await db.query("rollback");
  }
}

/** Like `as`, but commits. */
async function commitAs(user: string, sql: string, params: unknown[] = []) {
  await db.query("begin");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user })]);
    const result = await db.query(sql, params);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function expectError(promise: Promise<unknown>, pattern: RegExp) {
  await expect(promise).rejects.toThrow(pattern);
}

const ids: Record<string, string> = {};

beforeAll(async () => {
  admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  db = new Client({ connectionString: dbUrl(dbName) });
  await db.connect();

  const hasAuth = await db.query("select 1 from pg_namespace where nspname = 'auth'");
  if (hasAuth.rowCount === 0) {
    await db.query(readFileSync(join(ROOT, "tests/rls/supabase-shim.sql"), "utf8"));
  }
  const dir = join(ROOT, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.query(readFileSync(join(dir, file), "utf8"));
  }

  // Two users; the signup trigger creates their profiles.
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@example.com', '{\"full_name\":\"Ada A\"}'), ($2, 'b@example.com', '{}')", [userA, userB]);

  // Seed a full set of rows for user A, through RLS, as user A.
  const doc = await commitAs(userA, "insert into source_documents (user_id, filename, extracted_text) values ($1, 'a.txt', 'resume') returning id", [userA]);
  ids.doc = doc.rows[0].id;
  const job = await commitAs(userA, "insert into jobs (user_id, employer, title, start_date, end_date) values ($1, 'Riverside', 'Lead Custodian', '2019-06', 'present') returning id, code", [userA]);
  ids.job = job.rows[0].id;
  ids.jobCode = job.rows[0].code;
  const fact = await commitAs(userA, "insert into facts (user_id, type, job_id, text, origin) values ($1, 'duty', $2, 'Cleaned rooms', 'resume') returning id, code", [userA, ids.job]);
  ids.fact = fact.rows[0].id;
  ids.factCode = fact.rows[0].code;
  await commitAs(userA, "insert into fact_revisions (user_id, fact_id, previous_text, new_text) values ($1, $2, 'a', 'b')", [userA, ids.fact]);
  // Applications only go in through create_application (direct inserts are revoked).
  const app = await commitAs(
    userA,
    "select public.create_application('Coordinator', 'Mercy', 'posting', null, null, $1::jsonb) as id",
    [JSON.stringify([{ code: "R1", text: "Cleaning", kind: "required", logic: "all", ai_status: "strong", position: 0, evidence_fact_ids: [] }])],
  );
  ids.app = app.rows[0].id;
  const req = await db.query("select id from requirements where application_id = $1", [ids.app]);
  ids.req = req.rows[0].id;
  await commitAs(userA, "insert into requirement_evidence (user_id, requirement_id, fact_id) values ($1, $2, $3)", [userA, ids.req, ids.fact]);
  const document = await commitAs(userA, "insert into documents (user_id, application_id, kind, version, content) values ($1, $2, 'resume', 1, '{}') returning id", [userA, ids.app]);
  ids.document = document.rows[0].id;
  await db.query("insert into ai_calls (user_id, task, model, success) values ($1, 'extract', 'm', true)", [userA]);
  await db.query("insert into storage.objects (bucket_id, name) values ('resumes', $1)", [`${userA}/resume.pdf`]);
}, 60_000);

afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`drop database if exists ${dbName} with (force)`);
    await admin.end();
  }
});

const USER_TABLES = [
  "profiles",
  "source_documents",
  "jobs",
  "facts",
  "fact_revisions",
  "applications",
  "requirements",
  "requirement_evidence",
  "documents",
  "ai_calls",
];

describe("row level security", () => {
  it("every public table has RLS enabled", async () => {
    const result = await db.query(
      "select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity",
    );
    expect(result.rows).toEqual([]);
  });

  it("user A sees their own rows", async () => {
    await as(userA, async (c) => {
      for (const table of USER_TABLES) {
        const r = await c.query(`select count(*)::int as n from ${table}`);
        expect(r.rows[0].n, table).toBeGreaterThan(0);
      }
    });
  });

  it("user B sees none of user A's rows", async () => {
    await as(userB, async (c) => {
      for (const table of USER_TABLES) {
        const r = await c.query(`select count(*)::int as n from ${table} where user_id = $1`, [userA]);
        expect(r.rows[0].n, table).toBe(0);
      }
      const objects = await c.query("select count(*)::int as n from storage.objects");
      expect(objects.rows[0].n).toBe(0);
    });
  });

  it("anonymous visitors see nothing", async () => {
    for (const table of USER_TABLES) {
      await as(null, async (c) => {
        await expectError(c.query(`select * from ${table}`), /permission denied/);
      });
    }
  });

  it("user B can't update or delete user A's rows", async () => {
    await as(userB, async (c) => {
      expect((await c.query("update facts set text = 'hacked' where id = $1", [ids.fact])).rowCount).toBe(0);
      expect((await c.query("update jobs set title = 'hacked' where id = $1", [ids.job])).rowCount).toBe(0);
      expect((await c.query("update applications set status = 'offer' where id = $1", [ids.app])).rowCount).toBe(0);
      expect((await c.query("update documents set content = '{}' where id = $1", [ids.document])).rowCount).toBe(0);
      expect((await c.query("update profiles set full_name = 'x' where user_id = $1", [userA])).rowCount).toBe(0);
      expect((await c.query("delete from facts where id = $1", [ids.fact])).rowCount).toBe(0);
      expect((await c.query("delete from applications where id = $1", [ids.app])).rowCount).toBe(0);
      expect((await c.query("delete from requirement_evidence where fact_id = $1", [ids.fact])).rowCount).toBe(0);
      expect((await c.query("delete from storage.objects where name like $1", [`${userA}/%`])).rowCount).toBe(0);
    });
    await as(userA, async (c) => {
      const r = await c.query("select text from facts where id = $1", [ids.fact]);
      expect(r.rows[0].text).toBe("Cleaned rooms");
    });
  });

  it("user B can't insert rows owned by user A", async () => {
    await as(userB, async (c) => {
      await expectError(
        c.query("insert into applications (user_id, posting_text) values ($1, 'x')", [userA]),
        /row-level security|permission denied/,
      );
    });
    await as(userB, async (c) => {
      await expectError(
        c.query("insert into facts (user_id, type, text, origin) values ($1, 'duty', 'x', 'manual')", [userA]),
        /row-level security|No profile/,
      );
    });
    await as(userB, async (c) => {
      await expectError(
        c.query("insert into storage.objects (bucket_id, name) values ('resumes', $1)", [`${userA}/evil.pdf`]),
        /row-level security/,
      );
    });
  });

  it("user B can't link their rows to user A's rows", async () => {
    await as(userB, async (c) => {
      await expectError(
        c.query("insert into facts (user_id, type, job_id, text, origin) values ($1, 'duty', $2, 'x', 'manual')", [userB, ids.job]),
        /foreign key/,
      );
    });
    await as(userB, async (c) => {
      await expectError(
        c.query("insert into requirement_evidence (user_id, requirement_id, fact_id) values ($1, $2, gen_random_uuid())", [userB, ids.req]),
        /foreign key/,
      );
    });
    // create_application runs as definer, but evidence still has to be the caller's own facts.
    await as(userB, async (c) => {
      await expectError(
        c.query("select public.create_application('x', 'y', 'z', null, null, $1::jsonb)", [
          JSON.stringify([{ code: "R1", text: "x", kind: "required", logic: "all", ai_status: "strong", evidence_fact_ids: [ids.fact] }]),
        ]),
        /foreign key/,
      );
    });
  });

  it("users can't change their plan, billing fields or counters", async () => {
    for (const column of ["plan = 'pro'", "stripe_customer_id = 'cus_x'", "next_fact_no = 1", "imports_used = 0", "applications_created = 0", "subscription_status = 'active'", "current_period_end = now()", "billing_event_at = now()"]) {
      await as(userA, async (c) => {
        await expectError(c.query(`update profiles set ${column} where user_id = $1`, [userA]), /permission denied/);
      });
    }
    await as(userA, async (c) => {
      const r = await c.query("update profiles set full_name = 'Ada', phone = '555' where user_id = $1", [userA]);
      expect(r.rowCount).toBe(1);
    });
  });

  it("users can't write or erase their AI usage records", async () => {
    await as(userA, async (c) => {
      await expectError(
        c.query("insert into ai_calls (user_id, task, model, success) values ($1, 't', 'm', true)", [userA]),
        /permission denied/,
      );
    });
    await as(userA, async (c) => {
      await expectError(c.query("delete from ai_calls"), /permission denied/);
    });
  });

  it("only the server can use stripe_events", async () => {
    await as(userA, async (c) => {
      await expectError(c.query("select * from stripe_events"), /permission denied/);
    });
  });

  it("fact revisions can't be rewritten", async () => {
    await as(userA, async (c) => {
      await expectError(c.query("update fact_revisions set new_text = 'x'"), /permission denied/);
    });
  });
});

describe("codes", () => {
  it("assigns per-user codes starting at E1 and j1", () => {
    expect(ids.factCode).toBe("E1");
    expect(ids.jobCode).toBe("j1");
  });

  it("never reuses a code after a fact is deleted", async () => {
    await as(userA, async (c) => {
      await c.query("delete from facts where id = $1", [ids.fact]);
      const r = await c.query("insert into facts (user_id, type, text, origin) values ($1, 'skill', 'Mopping', 'manual') returning code", [userA]);
      expect(r.rows[0].code).toBe("E2");
    });
  });

  it("ignores attempts to set or change a code", async () => {
    await as(userA, async (c) => {
      const r = await c.query("insert into facts (user_id, code, type, text, origin) values ($1, 'E999', 'skill', 'x', 'manual') returning code", [userA]);
      expect(r.rows[0].code).not.toBe("E999");
      const u = await c.query("update facts set code = 'E1000' where id = $1 returning code", [ids.fact]);
      expect(u.rows[0].code).toBe("E1");
    });
  });

  it("each user has their own sequence", async () => {
    await as(userB, async (c) => {
      const r = await c.query("insert into facts (user_id, type, text, origin) values ($1, 'skill', 'x', 'manual') returning code", [userB]);
      expect(r.rows[0].code).toBe("E1");
    });
  });

  it("confirming a fact stamps confirmed_at", async () => {
    await as(userA, async (c) => {
      const r = await c.query("update facts set status = 'confirmed' where id = $1 returning confirmed_at", [ids.fact]);
      expect(r.rows[0].confirmed_at).not.toBeNull();
      const back = await c.query("update facts set status = 'pending' where id = $1 returning confirmed_at", [ids.fact]);
      expect(back.rows[0].confirmed_at).toBeNull();
    });
  });

  it("creates a profile with name and email on signup", async () => {
    const r = await db.query("select email, full_name, plan from profiles where user_id = $1", [userA]);
    expect(r.rows[0]).toEqual({ email: "a@example.com", full_name: "Ada A", plan: "free" });
  });
});

describe("account deletion", () => {
  it("deleting the auth user removes every row", async () => {
    await db.query("delete from auth.users where id = $1", [userA]);
    for (const table of USER_TABLES) {
      const r = await db.query(`select count(*)::int as n from ${table} where user_id = $1`, [userA]);
      expect(r.rows[0].n, table).toBe(0);
    }
  });

  it("users can't add applications or requirements except through create_application", async () => {
    await as(userA, async (c) => {
      await expectError(c.query("insert into applications (user_id, posting_text) values ($1, 'x')", [userA]), /permission denied/);
    });
    await as(userA, async (c) => {
      await expectError(
        c.query("insert into requirements (user_id, application_id, code, text, kind, ai_status) values ($1, $2, 'R9', 'x', 'required', 'strong')", [userA, ids.app]),
        /permission denied/,
      );
    });
  });

  it("create_application enforces the free plan limit itself", async () => {
    const reqs = JSON.stringify([{ code: "R1", text: "x", kind: "required", logic: "all", ai_status: "strong" }]);
    await as(userB, async (c) => {
      // User B is on Free with none created yet: two go in, the third is refused.
      await c.query("select public.create_application('a', 'b', 'p', null, null, $1::jsonb)", [reqs]);
      await c.query("select public.create_application('a', 'b', 'p', null, null, $1::jsonb)", [reqs]);
      await expectError(c.query("select public.create_application('a', 'b', 'p', null, null, $1::jsonb)", [reqs]), /limit_applications/);
    });
  });

  it("internal and server-only functions can't be called by visitors or users", async () => {
    const calls = [
      ["select public.next_code($1, 'fact')", [userA]],
      ["select public.reserve_ai_call($1, 't', 'm', 0, 10, 200, 5)", [userA]],
      ["select public.reserve_import($1)", [userA]],
      ["select public.release_import($1)", [userA]],
    ] as const;
    for (const who of [null, userA]) {
      for (const [sql, params] of calls) {
        await as(who, async (c) => {
          await expectError(c.query(sql, [...params]), /permission denied/);
        });
      }
    }
  });

  it("reserve_ai_call enforces the per-minute limit and the monthly cap", async () => {
    await db.query("begin");
    try {
      await db.query("set local role service_role");
      await db.query("select public.reserve_ai_call($1, 't', 'm', 0.01, 2, 200, 5)", [userB]);
      await db.query("select public.reserve_ai_call($1, 't', 'm', 0.01, 2, 200, 5)", [userB]);
      await expectError(db.query("select public.reserve_ai_call($1, 't', 'm', 0.01, 2, 200, 5)", [userB]), /rate_minute/);
    } finally {
      await db.query("rollback");
    }
    await db.query("begin");
    try {
      await db.query("set local role service_role");
      await db.query("select public.reserve_ai_call($1, 't', 'm', 4, 10, 200, 5)", [userB]);
      await expectError(db.query("select public.reserve_ai_call($1, 't', 'm', 2, 10, 200, 5)", [userB]), /cost_cap/);
    } finally {
      await db.query("rollback");
    }
  });

  it("reserve_import lets a free user import once", async () => {
    await db.query("begin");
    try {
      await db.query("set local role service_role");
      expect((await db.query("select public.reserve_import($1) as ok", [userB])).rows[0].ok).toBe(true);
      expect((await db.query("select public.reserve_import($1) as ok", [userB])).rows[0].ok).toBe(false);
      await db.query("select public.release_import($1)", [userB]);
      expect((await db.query("select public.reserve_import($1) as ok", [userB])).rows[0].ok).toBe(true);
    } finally {
      await db.query("rollback");
    }
  });
});
