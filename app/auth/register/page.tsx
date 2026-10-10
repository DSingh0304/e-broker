"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("KABADIWALA");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          password,
          full_name: fullName,
          role,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Registration failed");
      }

      // Auto login after registration
      const loginRes = await signIn("credentials", {
        phone,
        password,
        redirect: false,
      });

      if (loginRes?.error) {
        router.push("/auth/login?registered=1");
      } else {
        if (role === "VENDOR" || role === "RECYCLER") router.push("/vendor/dashboard");
        else router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Registration failed. Phone number may already be registered.");
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
            <h1 className="text-2xl font-bold uppercase text-[#D98C53] font-mono">Register Node</h1>
            <p className="text-[#C0C0C0] text-xs font-mono mt-1">Join the E-Broker Decentralized Marketplace</p>
          </div>

          {error && (
            <div role="alert" className="text-red-400 text-xs font-mono font-bold bg-red-900/30 p-3 border border-red-500 rounded">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="register-name" className="block text-xs font-bold text-[#FFD700] uppercase mb-1 font-mono">
                Full Name
              </label>
              <input
                id="register-name"
                name="fullName"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ramesh Kumar"
                className="w-full bg-[#165B45]/50 border border-[#B87333] rounded px-3 py-2 text-[#EAD0AC] focus:outline-none focus:border-[#FFD700] font-mono text-sm"
                required
              />
            </div>

            <div>
              <label htmlFor="register-phone" className="block text-xs font-bold text-[#FFD700] uppercase mb-1 font-mono">
                Phone Number
              </label>
              <input
                id="register-phone"
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
              <label htmlFor="register-password" className="block text-xs font-bold text-[#FFD700] uppercase mb-1 font-mono">
                Password
              </label>
              <input
                id="register-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={4}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#165B45]/50 border border-[#B87333] rounded px-3 py-2 text-[#EAD0AC] focus:outline-none focus:border-[#FFD700] font-mono text-sm"
                required
              />
            </div>

            <div>
              <label htmlFor="register-role" className="block text-xs font-bold text-[#FFD700] uppercase mb-1 font-mono">
                Account Role
              </label>
              <select
                id="register-role"
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-[#165B45]/50 border border-[#B87333] rounded px-3 py-2 text-[#EAD0AC] focus:outline-none focus:border-[#FFD700] font-mono text-sm"
              >
                <option value="KABADIWALA">Kabadiwala (Local Collector)</option>
                <option value="VENDOR">Vendor / Buyer</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="pcb-button w-full py-3 mt-2 text-xs uppercase tracking-widest font-mono font-bold disabled:opacity-50"
            >
              {loading ? "[ CREATING_ACCOUNT... ]" : "[ INITIALIZE_ACCOUNT ]"}
            </button>
          </form>

          <div className="text-center pt-2">
            <p className="text-xs font-mono text-pcb-silver/70">
              Already have an account?{" "}
              <Link href="/auth/login" className="text-pcb-gold underline font-bold hover:text-pcb-copper">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
