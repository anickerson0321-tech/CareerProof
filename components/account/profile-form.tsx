"use client";

import { useState } from "react";
import { api } from "@/lib/api/client";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Notice } from "@/components/common/notice";

interface ProfileFields {
  full_name: string;
  email: string;
  phone: string;
  location: string;
}

const FIELDS: { key: keyof ProfileFields; label: string; type: string; autoComplete: string }[] = [
  { key: "full_name", label: "Full name", type: "text", autoComplete: "name" },
  { key: "email", label: "Email on your documents", type: "email", autoComplete: "email" },
  { key: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
  { key: "location", label: "City and state", type: "text", autoComplete: "address-level2" },
];

export function ProfileForm({ initial }: { initial: ProfileFields }) {
  const hydrated = useHydrated();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const saved = await api<Record<keyof ProfileFields, string | null>>("/api/account/profile", { method: "PATCH", body: values });
      setValues({
        full_name: saved.full_name ?? "",
        email: saved.email ?? "",
        phone: saved.phone ?? "",
        location: saved.location ?? "",
      });
      setStatus({ tone: "success", text: "Saved. New downloads will use these details." });
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : "We couldn't save your details. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-form-ready={hydrated ? "" : undefined}>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <Label htmlFor={`profile-${f.key}`}>{f.label}</Label>
            <Input
              id={`profile-${f.key}`}
              type={f.type}
              autoComplete={f.autoComplete}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {status && <Notice tone={status.tone}>{status.text}</Notice>}
      <Button type="submit" className="self-start" disabled={!hydrated || saving}>
        {saving ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}
