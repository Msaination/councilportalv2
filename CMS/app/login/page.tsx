"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
export default function LoginPage() {
const [username, setUsername] = useState("");
const [password, setPassword] = useState("");
const [showPassword, setShowPassword] = useState(false);
const [loading, setLoading] = useState(false);
const [errorMessage, setErrorMessage] = useState("");
// Authenticate with username and password
const handleSubmit = async (
event: FormEvent<HTMLFormElement>
) => {
event.preventDefault();
if (loading) return;
setLoading(true);
setErrorMessage("");

try {
const response = await fetch("/api/auth/username-login", {
method: "POST",
headers: {
"Content-Type": "application/json",
Accept: "application/json",
},
body: JSON.stringify({
username: username.trim(),
password,
}),
});

const responseText = await response.text();

type LoginResult = {
success?: boolean;
error?: string;
session?: {
access_token: string;
refresh_token: string;
};
};

let result: LoginResult;

try {
result = JSON.parse(responseText) as LoginResult;
} catch {
console.error(
"Username login returned a non-JSON response:",
response.status,
responseText.slice(0, 500)
);

setErrorMessage(
response.status === 404
? "The login API route was not found. Check app/api/auth/username-login/route.ts."
: "The login server returned an error page. Check the VS Code terminal for the underlying API error."
);
return;
}

if (!response.ok) {
setErrorMessage(result.error || `Sign-in failed (${response.status}).`);
return;
}

if (result.success !== true) {
setErrorMessage(result.error || "The server did not confirm sign-in. Please try again.");
return;
}

if (!result.session?.access_token || !result.session?.refresh_token) {
console.error("Login response did not include a Supabase session:", result);
setErrorMessage(
"The server signed you in but did not return a session. Check the username-login API route."
);
return;
}

const supabase = createClient();
const { error: sessionError } = await supabase.auth.setSession({
access_token: result.session.access_token,
refresh_token: result.session.refresh_token,
});

if (sessionError) {
console.error("Could not establish Supabase session:", sessionError);
setErrorMessage(`Unable to establish your login session: ${sessionError.message}`);
return;
}

window.location.assign("/dashboard");
} catch (error) {
console.error("Username login request failed:", error);
setErrorMessage(
error instanceof Error
? error.message
: "Unable to connect to the server. Check that your Next.js server is running."
);
} finally {
setLoading(false);
}
};
return (
<main className="min-h-screen overflow-hidden bg-[#14532d] text-white">
<div className="relative min-h-screen">
{/* MUNICIPAL HEADER */}
<header className="relative z-30 border-b border-white/70 bg-white">
<div className="mx-auto flex min-h-[86px] max-w-[1380px] items-center justify-between gap-4 px-5 py-3 sm:px-10 lg:px-14">
<div className="group flex min-w-0 items-center gap-3.5 sm:gap-4">
<div className="relative flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl border border-green-900/10 bg-gradient-to-br from-white to-green-50 p-2 shadow-sm transition duration-300 group-hover:-translate-y-0.5 sm:h-[62px] sm:w-[62px]">
<span className="absolute -left-px top-2.5 h-7 w-[3px] rounded-r-full bg-green-800" />
<img
src="/Emalahleni Logo.png"
alt="Emalahleni Local Municipality logo"
className="h-full w-full object-contain"
/>
<span className="absolute -bottom-px right-2.5 h-[3px] w-7 rounded-t-full bg-green-600" />
</div>
<div className="min-w-0 border-l border-gray-200 pl-3.5 sm:pl-4">
<div className="mb-1 flex items-center gap-2">
<span className="h-[2px] w-5 rounded-full bg-green-600" />
<p className="text-[8px] font-extrabold uppercase tracking-[0.2em] text-green-800 sm:text-[9px]">
Serving the community
</p>
</div>
<p className="text-[12px] font-extrabold leading-tight tracking-tight text-gray-950 sm:text-[15px]">
Emalahleni Local Municipality
</p>
<p className="mt-1 hidden text-[10px] font-medium text-gray-500 sm:block">
Connecting communities. Delivering services.
</p>
</div>
</div>
<div className="hidden shrink-0 items-center gap-2.5 rounded-full border border-green-100 bg-green-50 px-3.5 py-2 sm:flex">
<span className="relative flex h-2 w-2">
<span className="absolute h-full w-full animate-ping rounded-full bg-green-500 opacity-40" />
<span className="relative h-2 w-2 rounded-full bg-green-600" />
</span>
<span className="text-[9px] font-bold uppercase tracking-wider text-green-800">
Municipal Services
</span>
</div>
</div>
<div className="flex h-[3px] w-full">
<div className="w-[72%] bg-green-800" />
<div className="w-[28%] bg-yellow-400" />
</div>
</header>
{/* MAIN CONTENT */}
<div className="relative z-10 mx-auto grid min-h-[calc(100vh-89px)] max-w-[1380px] grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
{/* LEFT INTRODUCTION */}
<section className="relative flex items-center px-6 py-10 sm:px-10 lg:px-14 lg:py-8">
<div className="w-full max-w-[650px]">
<div className="mb-5 flex items-center gap-3">
<span className="h-[3px] w-9 bg-green-600" />
<span className="text-[8px] font-black uppercase tracking-[0.25em] text-green-100 sm:text-[9px]">
Complaints Management System
</span>
</div>
<div className="min-h-[170px] sm:min-h-[190px] lg:min-h-[205px]">
<h1 className="text-[38px] font-light leading-[1.04] tracking-tight sm:text-[46px] lg:text-[53px] xl:text-[58px]">
<span className="text-green-100">
A municipality
</span>
<br />
<span className="font-black text-white">
Delivering Better Services.
</span>
</h1>
</div>
<p className="mt-1 max-w-[530px] text-[13px] leading-6 text-green-50/85 sm:text-sm">
Empowering municipal teams with a secure platform
to manage complaints, respond to communities and
strengthen accountable service delivery.
</p>
{/* KEY SERVICE VALUES */}
<div className="mt-6 grid max-w-[570px] grid-cols-3 border-y border-white/20">
<div className="py-3.5 pr-3 sm:pr-4">
<div className="mb-1.5 h-1 w-6 bg-green-800" />
<p className="text-[7px] font-black uppercase tracking-wider text-green-100/70">
Connected
</p>
<p className="mt-1 text-[10px] font-semibold text-yellow-300 sm:text-[11px]">
Communities
</p>
</div>
<div className="border-l border-white/20 px-3 py-3.5 sm:px-4">
<div className="mb-1.5 h-1 w-6 bg-green-600" />
<p className="text-[7px] font-black uppercase tracking-wider text-green-100/70">
Managed
</p>
<p className="mt-1 text-[10px] font-semibold text-yellow-300 sm:text-[11px]">
Services
</p>
</div>
<div className="border-l border-white/20 px-3 py-3.5 sm:px-4">
<div className="mb-1.5 h-1 w-6 bg-green-800" />
<p className="text-[7px] font-black uppercase tracking-wider text-green-100/70">
Trusted
</p>
<p className="mt-1 text-[10px] font-semibold text-yellow-300 sm:text-[11px]">
Governance
</p>
</div>
</div>
<div className="mt-6 flex items-center gap-3">
<div className="flex h-8 w-1 overflow-hidden rounded-full">
<span className="h-1/2 w-full bg-green-800" />
<span className="h-1/2 w-full bg-yellow-400" />
</div>
<div>
<p className="text-[7px] font-black uppercase tracking-[0.23em] text-green-100/70 sm:text-[8px]">
Municipal Complaints Management System
</p>
<p className="mt-1 text-[9px] text-green-100/75">
Secure • Centralised • Accountable
</p>
</div>
</div>
<div className="pointer-events-none absolute -bottom-20 -left-10 hidden opacity-[0.025] lg:block">
<img
src="/Emalahleni Logo.png"
alt=""
className="h-[350px] w-[350px] object-contain grayscale"
/>
</div>
</div>
</section>
{/* LOGIN CARD */}
<section className="relative flex items-center justify-center px-6 pb-12 sm:px-10 lg:px-10 lg:pb-0">
<div className="w-full max-w-[390px]">
<div className="overflow-hidden rounded-[22px] border border-emerald-200 bg-white text-gray-900 shadow-[0_25px_70px_rgba(0,0,0,0.22)]">
<div className="flex h-[4px]">
<div className="w-[70%] bg-green-800" />
<div className="w-[30%] bg-yellow-400" />
</div>
<div className="p-6 sm:p-7">
{/* CARD BRANDING */}
<div className="mb-6">
<div className="mb-5 flex items-center justify-between gap-2">
<div className="flex min-w-0 items-center gap-3">
<div className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-2xl border border-green-900/10 bg-gradient-to-br from-white to-green-50 p-2 shadow-sm">
<span className="absolute -left-px top-3 h-6 w-[3px] rounded-r-full bg-green-800" />
<img
src="/Emalahleni Logo.png"
alt="Emalahleni Local Municipality logo"
className="h-full w-full object-contain"
/>
<span className="absolute -bottom-px right-2 h-[3px] w-6 rounded-t-full bg-green-600" />
</div>
<div className="min-w-0">
<p className="text-[7px] font-extrabold uppercase tracking-[0.2em] text-green-800">
Staff Sign-In
</p>
<p className="mt-1 max-w-[155px] text-[11px] font-bold leading-snug text-gray-800">
Complaints Management System
</p>
<div className="mt-2 flex items-center gap-1.5">
<span className="h-1 w-5 rounded-full bg-green-800" />
<span className="h-1 w-2 rounded-full bg-yellow-400" />
</div>
</div>
</div>
<div className="ml-1 flex shrink-0 items-center gap-1 rounded-full border border-green-100 bg-green-50 px-2 py-1.5">
<svg
className="h-3 w-3 text-green-800"
fill="none"
stroke="currentColor"
viewBox="0 0 24 24"
aria-hidden="true"
>
<path
strokeLinecap="round"
strokeLinejoin="round"
strokeWidth={1.8}
d="M12 3 5 6v5c0 4.5 3 7.5 7 10 4-2.5 7-5.5 7-10V6l-7-3Z"
/>
<path
strokeLinecap="round"
strokeLinejoin="round"
strokeWidth={1.8}
d="m9 12 2 2 4-4"
/>
</svg>
<span className="text-[8px] font-bold text-green-800">
Secure
</span>
</div>
</div>
<h2 className="text-[27px] font-light tracking-tight">
Welcome
<span className="font-black text-green-800">.</span>
</h2>
<p className="mt-2 text-[13px] leading-5 text-gray-500">
Sign in using your municipal username and password.
</p>
</div>
{/* LOGIN FORM */}
<form onSubmit={handleSubmit} className="space-y-4">
{/* USERNAME */}
<div>
<label
htmlFor="username"
className="mb-1.5 block text-[8px] font-black uppercase tracking-[0.2em] text-gray-500"
>
Username
</label>
<div className="relative">
<svg
className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-green-800/60"
fill="none"
stroke="currentColor"
viewBox="0 0 24 24"
aria-hidden="true"
>
<path
strokeLinecap="round"
strokeLinejoin="round"
strokeWidth={1.5}
d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
/>
</svg>
<input
id="username"
name="username"
type="text"
autoComplete="username"
autoCapitalize="none"
spellCheck={false}
value={username}
onChange={(event) =>
setUsername(event.target.value)
}
placeholder="Enter your username"
required
disabled={loading}
className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-[13px] outline-none transition placeholder:text-gray-400 hover:border-gray-300 focus:border-green-700 focus:bg-white focus:ring-4 focus:ring-green-800/[0.07] disabled:opacity-60"
/>
</div>
</div>
{/* PASSWORD */}
<div>
<div className="mb-1.5 flex items-center justify-between">
<label
htmlFor="password"
className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-500"
>
Password
</label>
<Link
href="/forgot-password"
className="text-[9px] font-bold text-green-700 transition hover:text-green-900"
>
Forgot password?
</Link>
</div>
<div className="relative">
<svg
className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-green-800/50"
fill="none"
stroke="currentColor"
viewBox="0 0 24 24"
aria-hidden="true"
>
<path
strokeLinecap="round"
strokeLinejoin="round"
strokeWidth={1.5}
d="M7 10V7a5 5 0 0 1 10 0v3"
/>
<rect
x="4"
y="10"
width="16"
height="11"
rx="2"
strokeWidth={1.5}
/>
</svg>
<input
id="password"
name="password"
type={showPassword ? "text" : "password"}
autoComplete="current-password"
value={password}
onChange={(event) =>
setPassword(event.target.value)
}
placeholder="Enter your password"
required
disabled={loading}
className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-20 text-[13px] outline-none transition placeholder:text-gray-400 hover:border-gray-300 focus:border-green-700 focus:bg-white focus:ring-4 focus:ring-green-800/[0.07] disabled:opacity-60"
/>
<button
type="button"
onClick={() =>
setShowPassword((value) => !value)
}
aria-label={
showPassword ? "Hide password" : "Show password"
}
className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-gray-400 transition hover:bg-green-800/[0.05] hover:text-green-800"
>
{showPassword ? "Hide" : "Show"}
</button>
</div>
</div>
{/* ERROR MESSAGE */}
{errorMessage && (
<div
role="alert"
className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[11px] leading-5 text-red-700"
>
{errorMessage}
</div>
)}
{/* KEEP SIGNED IN NOTE */}
<div className="flex items-center gap-2">
<span className="h-1.5 w-1.5 rounded-full bg-green-600" />
<span className="text-[10px] text-gray-500">

</span>
</div>
{/* SIGN-IN BUTTON */}
<button
type="submit"
disabled={loading}
className="group relative flex h-12 w-full items-center justify-center overflow-hidden rounded-xl bg-green-800 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-[0_10px_25px_rgba(22,101,52,0.16)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-60"
>
<span className="absolute inset-0 translate-x-[-101%] bg-yellow-400 transition-transform duration-500 group-hover:translate-x-0" />
<span className="relative z-10 flex items-center gap-2.5 transition-colors group-hover:text-green-950">
{loading ? (
<>
<svg
className="h-4 w-4 animate-spin"
fill="none"
viewBox="0 0 24 24"
aria-hidden="true"
>
<circle
className="opacity-30"
cx="12"
cy="12"
r="10"
stroke="currentColor"
strokeWidth="3"
/>
<path
fill="currentColor"
d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4Z"
/>
</svg>
Signing in...
</>
) : (
<>
Sign in
<svg
className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
fill="none"
stroke="currentColor"
viewBox="0 0 24 24"
aria-hidden="true"
>
<path
strokeLinecap="round"
strokeLinejoin="round"
strokeWidth={2}
d="M5 12h14m-5-5 5 5-5 5"
/>
</svg>
</>
)}
</span>
</button>
</form>
{/* SECURITY NOTE */}
<div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
<svg
className="h-4 w-4 shrink-0 text-green-800/70"
fill="none"
stroke="currentColor"
viewBox="0 0 24 24"
aria-hidden="true"
>
<path
strokeLinecap="round"
strokeLinejoin="round"
strokeWidth={1.5}
d="M12 3 5 6v5c0 4.5 3 7.5 7 10 4-2.5 7-5.5 7-10V6l-7-3Z"
/>
<path
strokeLinecap="round"
strokeLinejoin="round"
strokeWidth={1.5}
d="m9 12 2 2 4-4"
/>
</svg>
<p className="text-[10px] leading-4 text-gray-400">
For authorised municipal personnel. Keep your
sign-in details private.
</p>
</div>
</div>
</div>
{/* TAGLINE */}
<div className="mt-3 flex items-center justify-center gap-2">
<span className="h-1 w-1 rounded-full bg-green-600" />
<span className="text-[7px] font-bold uppercase tracking-[0.22em] text-green-100/80">
Service • Integrity • Excellence
</span>
<span className="h-1 w-1 rounded-full bg-yellow-400" />
</div>
</div>
</section>
</div>
{/* BOTTOM COLOUR STRIPE */}
<div className="fixed bottom-0 left-0 z-40 h-[3px] w-full bg-green-800">
<div className="h-full w-[30%] bg-yellow-400" />
</div>
</div>
</main>
);
}
