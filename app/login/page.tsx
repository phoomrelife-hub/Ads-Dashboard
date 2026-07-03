"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("รหัสผ่านไม่ถูกต้อง");
        setLoading(false);
        return;
      }
      router.replace(params.get("next") || "/");
      router.refresh();
    } catch {
      setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050810] text-[#e8eaf5]">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ background: "#0a0e1a", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="mb-6 text-center">
          <div className="text-[15px] font-bold">Relife Ads</div>
          <div className="text-[12px] text-[#5a6a8a] mt-1">กรุณาใส่รหัสผ่านเพื่อเข้าใช้งาน</div>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="รหัสผ่าน"
          className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
          style={{ background: "#050810", border: "1px solid rgba(255,255,255,0.1)", color: "#e8eaf5" }}
        />
        {error && <div className="text-[12px] text-[#ff6b6b] mt-2">{error}</div>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full mt-4 rounded-lg py-2.5 text-[14px] font-medium disabled:opacity-50"
          style={{ background: "#5b6cff", color: "#fff" }}
        >
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
