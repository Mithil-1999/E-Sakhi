import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { RegisterForm } from "@/components/features/RegisterForm";

export const metadata: Metadata = {
  title: "Create account",
};

export default function RegisterPage() {
  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Create your account</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Save favorite stations, leave reviews, and report incorrect information.
        </p>
        <div className="mt-6">
          <RegisterForm />
        </div>
      </div>
    </Container>
  );
}
