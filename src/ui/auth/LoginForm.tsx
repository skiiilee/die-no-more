"use client";

import { useActionState } from "react";
import type { SignInFormState } from "@/types/auth";
import { signInAction } from "@/runtime/auth-actions";
import { SIGN_IN_MESSAGES } from "./sign-in-messages";
import styles from "./LoginForm.module.css";

const INITIAL: SignInFormState = { error: null };

/** `children` carries extra hidden fields, such as the streamed return path. */
export function LoginForm({ children }: { children?: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL);
  const errorId = "login-error";

  return (
    <form action={formAction} className={styles.form} noValidate>
      {children}
      <label htmlFor="password" className="visually-hidden">
        비밀번호
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="비밀번호"
        required
        className={styles.input}
        aria-invalid={state.error === "invalid_password"}
        aria-describedby={state.error ? errorId : undefined}
      />
      {state.error ? (
        <p id={errorId} role="alert" className={styles.error}>
          {SIGN_IN_MESSAGES[state.error]}
        </p>
      ) : null}
      <button type="submit" className={styles.submit} disabled={pending}>
        {pending ? "확인 중…" : "확인"}
      </button>
    </form>
  );
}
