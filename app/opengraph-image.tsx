import { ImageResponse } from "next/og";

export const alt = "CareerProof: resumes you can defend in an interview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f3f7f5", color: "#12201c" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 32 32">
            <rect x="5" y="3" width="22" height="26" rx="4" fill="#0e6b5b" />
            <path d="M10 10h12M10 15h8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            <path d="m11 21.5 3.2 3.2L21.5 17" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 48, fontWeight: 700 }}>CareerProof</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>Resumes you can defend in an interview.</span>
          <span style={{ fontSize: 32, color: "#4a5a55" }}>Every line is backed by a fact you confirmed.</span>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {["Supported", "Partly supported", "Needs your OK"].map((label, i) => (
            <span
              key={label}
              style={{ fontSize: 26, padding: "10px 22px", borderRadius: 999, background: ["#d9efe6", "#fbeccd", "#e3e9f3"][i], color: ["#0e6b5b", "#8a5a00", "#3c4f72"][i], fontWeight: 600 }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
