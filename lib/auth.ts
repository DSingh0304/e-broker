import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const authConfig: NextAuthConfig = {
  // Workers sit behind Cloudflare's proxy; trust forwarded host/proto so
  // callbacks and cookies use the public domain.
  trustHost: true,
  providers: [
    Credentials({
      name: "Phone Login",
      credentials: {
        phone: { label: "Phone", type: "tel" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const phone = typeof credentials?.phone === "string" ? credentials.phone : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!phone || !password) return null;

        try {
          const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, password }),
          });

          if (!res.ok) return null;
          const user = await res.json();
          return {
            id: user.id,
            name: user.full_name,
            phone: user.phone_number,
            role: user.role,
            email: `${user.phone_number}@ebroker.local`,
          };
        } catch (err) {
          console.error("Auth authorize error:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.phone = (user as any).phone;
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role as string;
        (session.user as any).phone = token.phone as string;
        (session.user as any).userId = token.userId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
  },
  session: { strategy: "jwt" },
  secret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "ebroker-local-dev-secret-change-in-prod",
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
