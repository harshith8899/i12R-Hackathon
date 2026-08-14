"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/shared/lib/trpc";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const register = trpc.auth.register.useMutation({
    onSuccess: () => {
      setTimeout(() => router.push("/login"), 1200);
    },
  });

  if (register.isSuccess) {
    return (
      <div className="mx-auto max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Account created</h1>
        <div className="panel p-5 text-sm">
          <p>
            Welcome, {register.data.name}. Your member account has been created.
          </p>
          <p className="muted mt-2">Taking you to sign in&hellip;</p>
        </div>
        <Link href="/login" className="btn btn-primary w-full block text-center">
          Sign in now
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="muted mt-1 text-sm">
          Sign up as a member to book classes and manage your membership.
        </p>
      </div>

      <form
        className="panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          register.mutate({
            name,
            email,
            password,
            phone: phone.trim() ? phone.trim() : undefined,
          });
        }}
      >
        <div className="space-y-1.5">
          <label className="text-sm muted">Name</label>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={1}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm muted">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm muted">Phone (optional)</label>
          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm muted">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <p className="muted text-xs">At least 6 characters.</p>
        </div>

        {register.error && (
          <p className="text-sm" style={{ color: "#f87171" }}>
            {register.error.data?.code === "CONFLICT"
              ? register.error.message
              : "Something went wrong. Please check your details and try again."}
          </p>
        )}

        <button
          className="btn btn-primary w-full"
          type="submit"
          disabled={register.isPending}
        >
          {register.isPending ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="text-sm muted">
        Already have an account?{" "}
        <Link href="/login" className="hover:text-white" style={{ color: "var(--text)" }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
