"use client";

import { useRef, useState, type FormEvent } from "react";
import type { UserId } from "@/types/expense";

const ACCOUNTS: Array<{ id: UserId; name: string }> = [
  { id: "aayushman", name: "Aayushman" },
  { id: "carlin", name: "Carlin" },
];

type LoginScreenProps = {
  error: string | null;
  isSubmitting: boolean;
  onDismissError: () => void;
  onLogin: (userId: UserId, password: string) => Promise<boolean>;
};

export function LoginScreen({
  error,
  isSubmitting,
  onDismissError,
  onLogin,
}: LoginScreenProps) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const [selectedUser, setSelectedUser] = useState<UserId>("aayushman");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const selectedName = ACCOUNTS.find((account) => account.id === selectedUser)?.name;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || isSubmitting) return;

    const didLogin = await onLogin(selectedUser, password);
    if (!didLogin) {
      setPassword("");
      passwordRef.current?.focus();
    }
  };

  return (
    <main className="login-shell">
      <div className="login-orb login-orb-one" aria-hidden="true" />
      <div className="login-orb login-orb-two" aria-hidden="true" />

      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">a.</span>
          <span>
            <strong>Ausgeben</strong>
            <small>Shared expenses</small>
          </span>
        </div>

        <div className="login-heading">
          <p className="eyebrow">Passau, Germany</p>
          <h1 id="login-title">Welcome back.</h1>
          <p>Choose your account to open the shared ledger.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <fieldset className="account-picker">
            <legend>Who are you?</legend>
            <div>
              {ACCOUNTS.map((account) => (
                <button
                  key={account.id}
                  className={selectedUser === account.id ? "account-choice selected" : "account-choice"}
                  type="button"
                  aria-pressed={selectedUser === account.id}
                  onClick={() => {
                    setSelectedUser(account.id);
                    setPassword("");
                    onDismissError();
                    window.setTimeout(() => passwordRef.current?.focus(), 0);
                  }}
                >
                  <span className={`account-avatar account-avatar-${account.id}`} aria-hidden="true">
                    {account.name.charAt(0)}
                  </span>
                  <span>{account.name}</span>
                  <span className="account-check" aria-hidden="true">✓</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="login-password-group">
            <label htmlFor="account-password">Password</label>
            <div className="password-input-wrap">
              <input
                ref={passwordRef}
                id="account-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={`Password for ${selectedName}`}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) onDismissError();
                }}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {error ? (
              <p className="login-error" id="login-error" role="alert">
                <span aria-hidden="true">!</span>
                {error}
              </p>
            ) : null}
          </div>

          <button
            className="primary-button login-submit"
            type="submit"
            disabled={!password || isSubmitting}
          >
            {isSubmitting ? (
              <span className="button-spinner" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">→</span>
            )}
            {isSubmitting ? "Signing in…" : `Continue as ${selectedName}`}
          </button>
        </form>

        <p className="login-note">
          <span aria-hidden="true" />
          Private and shared between just the two of you.
        </p>
      </section>
    </main>
  );
}

export function SessionLoading() {
  return (
    <main className="session-loading" role="status" aria-label="Opening Ausgeben">
      <span className="brand-mark" aria-hidden="true">a.</span>
      <div className="session-loading-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>Opening your shared ledger…</p>
    </main>
  );
}
