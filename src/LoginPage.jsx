import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { base44 } from "./api/base44Client";
import magpieMarkSrc from "./icon/magpie-mark.png";

function Mark() {
  return <img src={magpieMarkSrc} alt="" className="magpie-mark" width="34" height="34" />;
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
              <button className="auth-provider google" onClick={() => handleProvider("google")} disabled={isSubmitting}><span className="provider-letter">G</span> Continue with Google</button>
              <button className="auth-provider apple" onClick={() => handleProvider("apple")} disabled={isSubmitting}><span className="provider-letter apple-mark">●</span> Continue with Apple</button>
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
          <h2>Find it once.<br /><em>Keep it useful.</em></h2>
          <p>Magpie turns scattered pages into living, structured collections, so your next decision starts with what you already found.</p>
          <div className="auth-flow-card">
            <div className="auth-flow-row"><span className="auth-flow-icon">01</span><div><b>Capture</b><small>Save the page, listing, or idea that matters.</small></div><Check size={16} /></div>
            <div className="auth-flow-row"><span className="auth-flow-icon">02</span><div><b>Organize</b><small>Magpie understands what it is and files it.</small></div><Check size={16} /></div>
            <div className="auth-flow-row"><span className="auth-flow-icon">03</span><div><b>Stay current</b><small>See trusted changes instead of stale bookmarks.</small></div><Check size={16} /></div>
          </div>
          <div className="auth-visual-foot"><span className="auth-dot" /> Owner-scoped by design</div>
        </div>
      </section>
    </main>
  );
}
