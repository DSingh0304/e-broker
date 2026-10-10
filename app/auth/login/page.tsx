"use client";

import React, { useState, Suspense } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        phone,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Invalid phone number or password.");
      } else {
        const session = await getSession();
        const role = (session?.user as any)?.role;

        if (callbackUrl) {
          router.push(callbackUrl);
        } else if (role === "ADMIN") {
          router.push("/admin");
        } else if (role === "VENDOR") {
          router.push("/vendor/dashboard");
        } else {
          router.push("/dashboard");
        }
      }
    } catch (err) {
      setError("An unexpected authentication error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-pcb-dark">
      <div className="pcb-border p-8 rounded-xl bg-[#0F3B2C] chip-node w-full max-w-md relative overflow-hidden shadow-2xl">
        <div className="absolute inset-0 trace-bg opacity-30"></div>
        <div className="relative z-10 space-y-6">
          <div>
            <h1 className="text-2xl font-bold uppercase text-[#D98C53] font-mono">System Login</h1>
            <p className="text-[#C0C0C0] text-xs font-mono mt-1">Enter your platform node credentials</p>
          </div>

          {error && (
            <div role="alert" className="text-red-400 text-xs font-mono font-bold bg-red-900/30 p-3 border border-red-500 rounded">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="login-phone" className="block text-xs font-bold text-[#FFD700] uppercase mb-1 font-mono">
                Phone Number
              </label>
              <input
                id="login-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full bg-[#165B45]/50 border border-[#B87333] rounded px-3 py-2 text-[#EAD0AC] focus:outline-none focus:border-[#FFD700] font-mono text-sm"
                required
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-bold text-[#FFD700] uppercase mb-1 font-mono">
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#165B45]/50 border border-[#B87333] rounded px-3 py-2 text-[#EAD0AC] focus:outline-none focus:border-[#FFD700] font-mono text-sm"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="pcb-button w-full py-3 mt-2 text-xs uppercase tracking-widest font-mono font-bold disabled:opacity-50"
            >
              {loading ? "[ AUTHENTICATING... ]" : "[ AUTHENTICATE_NODE ]"}
            </button>
          </form>

          <div className="text-center pt-2">
            <p className="text-xs font-mono text-pcb-silver/70">
              Don&apos;t have an account?{" "}
              <Link href="/auth/register" className="text-pcb-gold underline font-bold hover:text-pcb-copper">
                Create new account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-pcb-dark flex items-center justify-center font-mono text-xs text-pcb-gold">
          ⚡ Initializing node interface...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
