import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { base44 } from "./api/base44Client";
import magpieMarkSrc from "./icon/magpie-mark.png";

function Mark() {
  return <img src={magpieMarkSrc} alt="" className="magpie-mark" width="34" height="34" />;
}

function GoogleMark() {
  return (
    <svg className="provider-mark" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg className="provider-mark" width="16" height="16" viewBox="0 0 814 1000" fill="currentColor" aria-hidden="true">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-123.1C40.9 764.9 0 663.8 0 559.5c0-158.8 103.2-243.1 204.7-243.1 65.5 0 120.4 42.8 161.3 42.8 39 0 100.4-45.4 172.8-45.4 34.5 0 88.6 6.2 129.2 40.4-3.9-2.9-3.9-2.9-.9 0zM555.5 148c33.6-40.3 57.5-96.5 57.5-152.7 0-7.8-.6-15.7-2-22-52.9 2-115.7 35.3-153.8 79.5-30.9 34.5-59.7 90.7-59.7 147.7 0 8.5 1.3 17 2 19.7 3.2.6 8.5 1.3 13.8 1.3 47.6 0 107.5-31.9 142.2-73.5z" />
    </svg>
  );
}

function authError(error) {
  return error?.response?.data?.error || error?.message || "Something went wrong. Please try again.";
}

export default function LoginPage({ onBack, onAuthenticated, redirectPath = "/" }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const updateMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setOtp("");
  };

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);
    try {
      if (mode === "signup") {
        await base44.auth.register({ email: email.trim(), password });
        setMode("verify");
        setNotice("We sent a verification code to your email.");
      } else if (mode === "verify") {
        await base44.auth.verifyOtp({ email: email.trim(), otpCode: otp.trim() });
        const response = await base44.auth.loginViaEmailPassword(email.trim(), password);
        onAuthenticated(response.user, redirectPath);
      } else {
        const response = await base44.auth.loginViaEmailPassword(email.trim(), password);
        onAuthenticated(response.user, redirectPath);
      }
    } catch (submitError) {
      setError(authError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProvider = (provider) => {
    setError("");
    setIsSubmitting(true);
    base44.auth.loginWithProvider(provider, redirectPath);
  };

  const title = mode === "signup" ? "Create your workspace" : mode === "verify" ? "Check your inbox" : "Welcome back";
  const subtitle = mode === "signup" ? "Save the things you find and keep them useful." : mode === "verify" ? `Enter the code we sent to ${email}.` : "Your research, organized without the busywork.";

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <button className="auth-back" onClick={onBack}><ArrowLeft size={15} /> Back to Magpie</button>
        <div className="auth-form-wrap">
          <div className="auth-brand"><Mark /><span>magpie</span></div>
          <div className="auth-kicker"><LockKeyhole size={13} /> private workspace</div>
          <h1>{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>

          {mode !== "verify" && (
            <div className="auth-provider-stack">
              <button className="auth-provider google" onClick={() => handleProvider("google")} disabled={isSubmitting}><GoogleMark /> Continue with Google</button>
              <button className="auth-provider apple" onClick={() => handleProvider("apple")} disabled={isSubmitting}><AppleMark /> Continue with Apple</button>
              <div className="auth-divider"><span>or</span></div>
            </div>
          )}

          <form className="auth-form" onSubmit={handleEmailSubmit}>
            <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required disabled={mode === "verify"} /></label>
            {mode !== "verify" && <label>Password<div className="auth-password"><input type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required minLength={8} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>}
            {mode === "verify" && <label>Verification code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="123456" required /></label>}
            {error && <div className="auth-error" role="alert">{error}</div>}
            {notice && <div className="auth-notice"><Mail size={15} /> {notice}</div>}
            <button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />} {mode === "signup" ? "Create workspace" : mode === "verify" ? "Verify email" : "Sign in"}</button>
          </form>

          {mode === "login" && <div className="auth-switch">New to Magpie? <button onClick={() => updateMode("signup")}>Create an account</button></div>}
          {mode === "signup" && <div className="auth-switch">Already have an account? <button onClick={() => updateMode("login")}>Sign in</button></div>}
          {mode === "verify" && <div className="auth-switch"><button onClick={() => updateMode("signup")}>Use a different email</button></div>}
          <div className="auth-trust"><ShieldCheck size={14} /> Your extension is write-only. Your workspace stays private.</div>
        </div>
      </section>
      <section className="auth-visual" aria-label="How Magpie works">
        <div className="auth-visual-inner">
          <div className="auth-visual-kicker">A calmer way to research</div>
          <h2>Find it once.<br />Keep it useful.</h2>
          <p>Magpie turns scattered pages into living, structured collections, so your next decision starts with what you already found.</p>
          <div className="auth-flow-card">
            <div className="auth-flow-row"><span className="auth-flow-dot" /><div><b>Capture</b><small>Save the page, listing, or idea that matters.</small></div><Check size={16} /></div>
            <div className="auth-flow-row"><span className="auth-flow-dot" /><div><b>Organize</b><small>Magpie understands what it is and files it.</small></div><Check size={16} /></div>
            <div className="auth-flow-row"><span className="auth-flow-dot" /><div><b>Stay current</b><small>See trusted changes instead of stale bookmarks.</small></div><Check size={16} /></div>
          </div>
          <div className="auth-visual-foot"><span className="auth-dot" /> Owner-scoped by design</div>
        </div>
      </section>
    </main>
  );
}
