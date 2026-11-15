"use client";

import type { ReactNode } from "react";


import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Councillor = {
  id: string;
  first_name: string;
  surname: string;
  ward_number: string;
  contact_number: string | null;
  email: string | null;
  status: "Active" | "Inactive";
  created_at: string;
  updated_at: string;
};

type Profile = {
  access_level: string | null;
  department_id: string | null;
  full_name: string | null;
};

type CouncillorForm = {
  first_name: string;
  surname: string;
  ward_number: string;
  contact_number: string;
  email: string;
  status: "Active" | "Inactive";
};

const MUNICIPAL_WARD_NUMBERS = Array.from({ length: 34 }, (_, index) => String(index + 1));

const emptyForm: CouncillorForm = {
  first_name: "",
  surname: "",
  ward_number: "",
  contact_number: "",
  email: "",
  status: "Active",
};

const supabase = createClient();

function normalizeRole(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function isAdminRole(value: unknown) {
  return [
    "administrator", "system administrator", "admin", "system admin",
    "super admin", "super administrator", "municipal administrator",
  ].includes(normalizeRole(value));
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

export default function CouncillorsPage() {
  const [councillors, setCouncillors] = useState<Councillor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [isAdmin, setIsAdmin] = useState(false);
  const [canView, setCanView] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CouncillorForm>(emptyForm);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [loggedInName, setLoggedInName] = useState("Municipal User");
  const [loggedInEmail, setLoggedInEmail] = useState("");
  const [loggedInRole, setLoggedInRole] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const loadCouncillors = useCallback(async () => {
    setLoading(true);
    setPageError("");
    const { data, error } = await supabase
      .from("councillors")
      .select("id, first_name, surname, ward_number, contact_number, email, status, created_at, updated_at")
      .order("ward_number", { ascending: true });

    if (error) {
      setPageError(
        error.message.includes("permission") || error.code === "42501"
          ? "You do not have permission to view councillor records. Please check the councillors table Row Level Security policies."
          : `Could not load councillors: ${error.message}`
      );
      setCouncillors([]);
    } else {
      setCouncillors((data ?? []) as Councillor[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    const initialise = async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !authData.user) {
        window.location.assign("/login");
        return;
      }

      const metadata = authData.user.user_metadata ?? {};
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("access_level, department_id, full_name")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (!active) return;
      if (profileError) {
        setPageError(`Could not verify your account permissions: ${profileError.message}`);
        setAuthChecked(true);
        return;
      }

      const savedProfile = profile as Profile | null;
      const role = savedProfile?.access_level ?? metadata.access_level ?? metadata.role ?? metadata.user_role;
      const firstName = String(metadata.first_name ?? metadata.firstName ?? metadata.given_name ?? "").trim();
      const surname = String(metadata.surname ?? metadata.last_name ?? metadata.lastName ?? metadata.family_name ?? "").trim();
      const metadataName = [firstName, surname].filter(Boolean).join(" ") || String(metadata.full_name ?? metadata.name ?? "").trim();
      setLoggedInName(savedProfile?.full_name || metadataName || authData.user.email || "Municipal User");
      setLoggedInEmail(authData.user.email || "");
      setLoggedInRole(String(role ?? ""));
      const admin = isAdminRole(role);
      const normalized = normalizeRole(role);
      const permittedViewer = [
        "call centre agent", "call center agent", "call-centre agent",
        "supervisor", "departmental supervisor", "department supervisor",
        "call centre agent supervisor", "call center agent supervisor", "clerk",
      ].includes(normalized);

      if (!active) return;
      setIsAdmin(admin);
      setCanView(admin || permittedViewer);
      setAuthChecked(true);

      if (!admin && !permittedViewer) {
        setPageError("You do not have permission to access the Councillors directory.");
        setLoading(false);
        return;
      }

      await loadCouncillors();
    };

    void initialise();
    return () => { active = false; };
  }, [loadCouncillors]);

  const filteredCouncillors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return councillors.filter((person) => {
      const matchesSearch = !query || [
        person.first_name,
        person.surname,
        person.ward_number,
        person.contact_number ?? "",
        person.email ?? "",
      ].some((value) => value.toLowerCase().includes(query));
      const matchesStatus = statusFilter === "All" || person.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [councillors, search, statusFilter]);

  const activeCount = councillors.filter((person) => person.status === "Active").length;
  const wardCount = new Set(councillors.filter((person) => person.status === "Active").map((person) => person.ward_number.trim().toLowerCase())).size;

  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setNotice("");
    setModalOpen(true);
  };

  const openEditModal = (person: Councillor) => {
    setEditingId(person.id);
    setForm({
      first_name: person.first_name,
      surname: person.surname,
      ward_number: person.ward_number,
      contact_number: person.contact_number ?? "",
      email: person.email ?? "",
      status: person.status,
    });
    setNotice("");
    setModalOpen(true);
  };

  const saveCouncillor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin) return;

    const firstName = form.first_name.trim();
    const surname = form.surname.trim();
    const ward = form.ward_number.trim();
    const phone = form.contact_number.trim();
    const email = form.email.trim();

    if (!firstName || !surname || !ward || !phone || !email) {
      setPageError("Complete all fields before saving the councillor.");
      return;
    }
    if (!/^0\d{9}$/.test(phone)) {
      setPageError("Enter a valid 10-digit South African contact number, for example 0821234567.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setPageError("Enter a valid email address.");
      return;
    }

    setSaving(true);
    setPageError("");
    setNotice("");
    const payload = {
      first_name: firstName,
      surname,
      ward_number: ward,
      contact_number: phone,
      email,
      status: form.status,
      updated_at: new Date().toISOString(),
    };

    const result = editingId
      ? await supabase.from("councillors").update(payload).eq("id", editingId)
      : await supabase.from("councillors").insert(payload);

    if (result.error) {
      setPageError(
        result.error.code === "23505"
          ? `An active councillor is already registered for Ward ${ward}. Deactivate the existing record before assigning another councillor to that ward.`
          : `Could not save councillor: ${result.error.message}`
      );
      setSaving(false);
      return;
    }

    setModalOpen(false);
    setForm(emptyForm);
    setEditingId(null);
    setNotice(editingId ? "Councillor details updated successfully." : "Councillor added successfully.");
    setSaving(false);
    await loadCouncillors();
  };

  const toggleStatus = async (person: Councillor) => {
    if (!isAdmin) return;
    const nextStatus = person.status === "Active" ? "Inactive" : "Active";
    const confirmed = window.confirm(
      `${nextStatus === "Inactive" ? "Deactivate" : "Activate"} ${person.first_name} ${person.surname}?`
    );
    if (!confirmed) return;

    setPageError("");
    const { error } = await supabase
      .from("councillors")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", person.id);

    if (error) {
      setPageError(`Could not update councillor status: ${error.message}`);
      return;
    }
    setNotice(`${person.first_name} ${person.surname} is now ${nextStatus.toLowerCase()}.`);
    await loadCouncillors();
  };

  if (!authChecked || loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-[#f5f7f4] px-4">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-emerald-800 border-t-transparent" />
          <p className="mt-3 text-sm font-medium text-slate-600">Loading councillor directory...</p>
        </div>
      </main>
    );
  }

  if (!canView) {
    return (
      <main className="min-h-[60vh] bg-[#f5f7f4] p-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white p-6">
          <h1 className="text-lg font-bold text-slate-900">Access restricted</h1>
          <p className="mt-2 text-sm text-slate-600">{pageError || "Your account is not authorised to view this page."}</p>
          <Link href="/dashboard" className="mt-4 inline-flex rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900">Return to dashboard</Link>
        </div>
      </main>
    );
  }

  const normalizedRole = normalizeRole(loggedInRole);
  const isSupervisor = ["supervisor", "departmental supervisor", "department supervisor", "call centre agent supervisor", "call center agent supervisor", "clerk"].includes(normalizedRole);
  const isCallCentreAgent = ["call centre agent", "call center agent", "call-centre agent", "call-centre", "call center", "call centre"].includes(normalizedRole);
  const userInitials = loggedInName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "U";
  const todayLabel = new Date().toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      window.alert(`Unable to sign out: ${error.message}`);
      setSigningOut(false);
      return;
    }
    window.location.assign("/login");
  };

  const Icon = ({ name }: { name: "dashboard" | "complaints" | "departments" | "reports" | "users" | "settings" | "menu" | "close" | "calendar" | "arrow" | "logout" }) => {
    const common = { className: "h-[17px] w-[17px]", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
    const shapes: Record<string, ReactNode> = {
      dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4" rx="1.5"/><rect x="14" y="10" width="7" height="11" rx="1.5"/><rect x="3" y="13" width="7" height="8" rx="1.5"/></>,
      complaints: <><path d="M8 10h8M8 14h5"/><path d="M20 11.5a8 8 0 1 1-3.2-6.4"/><path d="m15 3 3 3 3-3"/></>,
      departments: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5"/><path d="M9 9h.01M15 9h.01M9 12h.01M15 12h.01"/></>,
      reports: <><path d="M4 19V5M4 19h17"/><path d="M8 16v-4m4 4V8m4 8v-6m4 6V4"/></>,
      users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
      settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.8 3.12-.09-.03a1.7 1.7 0 0 0-1.82.47l-.07.08h-3.6l-.02-.1a1.7 1.7 0 0 0-1.3-1.32l-.1-.02-1.8-3.12.07-.07a1.7 1.7 0 0 0 0-2.4l-.07-.07 1.8-3.12.1-.02a1.7 1.7 0 0 0 1.3-1.32l.02-.1h3.6l.07.08a1.7 1.7 0 0 0 1.82.47l.09-.03 1.8 3.12-.06.06A1.7 1.7 0 0 0 19.4 15Z"/></>,
      menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
      close: <path d="m6 6 12 12M18 6 6 18"/>,
      calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
      arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
      logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></>,
    };
    return <svg {...common}>{shapes[name]}</svg>;
  };

  const mainLinks = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" as const },
    { href: "/complaints", label: "Complaints", icon: "complaints" as const },
    { href: "/departments", label: "Departments", icon: "departments" as const },
    { href: "/reports", label: "Reports", icon: "reports" as const },
  ];
  const managementLinks = isAdmin
    ? [
        { href: "/users", label: "Users & Roles", icon: "users" as const },
        { href: "/staff", label: "Staff", icon: "users" as const },
        { href: "/councillors", label: "Councillors", icon: "users" as const },
        { href: "/settings", label: "Settings", icon: "settings" as const },
      ]
    : isCallCentreAgent
      ? [
          { href: "/staff", label: "Staff", icon: "users" as const },
          { href: "/councillors", label: "Councillors", icon: "users" as const },
        ]
      : [
          { href: "/staff", label: "Staff", icon: "users" as const },
        ];
  const visibleMainLinks = isAdmin || isCallCentreAgent
    ? mainLinks
    : isSupervisor
      ? mainLinks.filter((item) => ["/dashboard", "/reports"].includes(item.href))
      : mainLinks.filter((item) => item.href === "/dashboard");

  return (
    <main className="min-h-screen bg-[#f5f7f4] text-slate-900">
      {sidebarOpen && <button type="button" aria-label="Close navigation overlay" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-slate-200 bg-white shadow-sm transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}>
        <div className="relative border-b border-slate-100 bg-gradient-to-br from-white via-white to-green-50/80 px-4 pb-4 pt-4">
          <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-green-900 via-green-700 to-[#F2C94C]" />
          <div className="flex items-center gap-3">
            <div className="relative flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-2xl border border-green-900/10 bg-white p-2 shadow-sm">
              <img src="/Emalahleni%20Logo.png" alt="Emalahleni Local Municipality logo" className="h-full w-full object-contain" />
              <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-[#F2C94C]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-green-800">Mpumalanga</p>
              <h2 className="mt-1 text-[16px] font-black leading-tight tracking-tight text-slate-950">EMALAHLENI</h2>
              <p className="mt-1 text-[10px] font-semibold text-slate-600">Local Municipality</p>
              <div className="mt-2 flex items-center gap-1.5"><span className="h-[3px] w-6 rounded-full bg-green-800"/><span className="h-[3px] w-3 rounded-full bg-[#F2C94C]"/><span className="ml-1 text-[9px] text-slate-400">Serving our community</span></div>
            </div>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close menu" className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-green-50 hover:text-green-800 lg:hidden"><Icon name="close"/></button>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto bg-[#14532d] px-3 py-5 text-white">
          <div className="mb-3 flex items-center justify-between px-3"><span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE082]">MAIN MENU</span><span className="text-[9px] font-semibold text-white/50">01</span></div>
          <div className="space-y-1">
            {visibleMainLinks.map((item) => <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)} className="group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-white/85 transition-all hover:bg-white/10 hover:text-white">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70 group-hover:text-[#FFE082]"><Icon name={item.icon}/></span>
              <span className="min-w-0 flex-1 text-[11px] font-bold">{item.label}</span><span className="text-white/40 opacity-0 transition group-hover:opacity-100"><Icon name="arrow"/></span>
            </Link>)}
          </div>
          <div className="mb-3 mt-7 flex items-center justify-between px-3"><span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE082]">{isAdmin ? "USER MANAGEMENT" : "MANAGEMENT"}</span><span className="text-[9px] font-semibold text-white/50">02</span></div>
          <div className="space-y-1">
            {managementLinks.map((item) => <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)} className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all ${item.href === "/councillors" ? "bg-white/10 text-white shadow-sm shadow-black/10" : "text-white/85 hover:bg-white/10 hover:text-white"}`}>
              {item.href === "/councillors" && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-white/80"/>}
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.href === "/councillors" ? "bg-white/10 text-[#FFE082]" : "bg-white/10 text-white/70 group-hover:text-[#FFE082]"}`}><Icon name={item.icon}/></span>
              <span className="min-w-0 flex-1 text-[11px] font-bold">{item.label}</span><span className="text-white/70"><Icon name="arrow"/></span>
            </Link>)}
          </div>
        </nav>
        <div className="border-t border-white/15 bg-[#14532d] p-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F2C94C] text-[11px] font-extrabold text-green-950">{userInitials}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white">{loggedInName}</p><p className="mt-0.5 truncate text-[10px] text-green-100/70">{loggedInEmail || "Authenticated account"}</p></div>
            <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" title="Signed in"/>
          </div>
        </div>
      </aside>
      <div className="min-h-screen lg:pl-[264px]">
        <header className="sticky top-0 z-30 flex min-h-[70px] items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 shadow-sm backdrop-blur sm:px-6 xl:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-green-50 lg:hidden"><Icon name="menu"/></button>
            <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-green-800">Complaints Management System</p><h1 className="mt-1 truncate text-xl font-extrabold tracking-tight text-slate-900">Councillors</h1></div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500 sm:flex"><Icon name="calendar"/><span>{todayLabel}</span></div>
            <div className="relative">
              <button type="button" onClick={() => setProfileMenuOpen((open) => !open)} className="flex max-w-[230px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-left transition hover:border-green-300 hover:bg-green-50/50 sm:px-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-800 text-[10px] font-bold text-white">{userInitials}</span>
                <span className="hidden min-w-0 md:block"><span className="block max-w-[160px] truncate text-[11px] font-bold text-slate-800">{loggedInName}</span><span className="block max-w-[160px] truncate text-[10px] text-slate-500">{loggedInEmail}</span></span><span className="text-xs text-slate-500">{profileMenuOpen ? "▴" : "▾"}</span>
              </button>
              {profileMenuOpen && <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"><Icon name="logout"/>{signingOut ? "Signing out..." : "Sign out"}</button></div>}
            </div>
          </div>
        </header>
        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Link href="/dashboard" className="hover:text-emerald-800">Dashboard</Link>
              <span>/</span><span>Management</span><span>/</span><span>Staff</span><span>/</span>
              <span className="text-emerald-800">Councillors</span>
            </div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-800">Management · Staff</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Councillors</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">Ward councillor contact directory for community complaint alerts and municipal follow-ups.</p>
          </div>
          {isAdmin && (
            <button type="button" onClick={openAddModal} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
              <span className="text-lg leading-none">+</span> Add councillor
            </button>
          )}
        </div>

        {pageError && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{pageError}</div>}
        {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div>}

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total councillors</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">{councillors.length}</p>
            <p className="mt-1 text-xs text-slate-500">All registered records</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active councillors</p>
            <p className="mt-2 text-3xl font-extrabold text-emerald-800">{activeCount}</p>
            <p className="mt-1 text-xs text-slate-500">Available for ward lookups</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Wards represented</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">{wardCount}</p>
            <p className="mt-1 text-xs text-slate-500">Wards with an active councillor</p>
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">Councillor directory</h2>
              <p className="mt-1 text-xs text-slate-500">Search by name, ward, contact number or email address.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search councillors..." className="h-10 min-w-0 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:w-64" />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-600">
                <option value="All">All statuses</option><option value="Active">Active</option><option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          {filteredCouncillors.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800"><span className="text-2xl">♙</span></div>
              <h3 className="mt-4 text-sm font-bold text-slate-900">No councillors found</h3>
              <p className="mt-1 text-sm text-slate-500">{councillors.length === 0 ? "No councillors have been registered yet." : "Try changing your search or status filter."}</p>
              {isAdmin && councillors.length === 0 && <button type="button" onClick={openAddModal} className="mt-4 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900">Add the first councillor</button>}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[850px] text-left">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr><th className="px-5 py-3 font-bold">Councillor</th><th className="px-5 py-3 font-bold">Ward</th><th className="px-5 py-3 font-bold">Contact number</th><th className="px-5 py-3 font-bold">Email address</th><th className="px-5 py-3 font-bold">Status</th>{isAdmin && <th className="px-5 py-3 text-right font-bold">Actions</th>}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCouncillors.map((person) => (
                      <tr key={person.id} className="transition hover:bg-slate-50/70">
                        <td className="px-5 py-4"><p className="text-sm font-bold text-slate-900">{person.first_name} {person.surname}</p><p className="mt-0.5 text-[11px] text-slate-400">Added {formatDate(person.created_at)}</p></td>
                        <td className="px-5 py-4"><span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-900">Ward {person.ward_number}</span></td>
                        <td className="px-5 py-4 text-sm text-slate-700">{person.contact_number || "Not provided"}</td>
                        <td className="px-5 py-4 text-sm text-slate-700">{person.email || "Not provided"}</td>
                        <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${person.status === "Active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{person.status}</span></td>
                        {isAdmin && <td className="px-5 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={() => openEditModal(person)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">Edit</button><button type="button" onClick={() => void toggleStatus(person)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">{person.status === "Active" ? "Deactivate" : "Activate"}</button></div></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-slate-100 md:hidden">
                {filteredCouncillors.map((person) => (
                  <article key={person.id} className="p-4">
                    <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">{person.first_name} {person.surname}</h3><p className="mt-1 text-xs font-semibold text-emerald-800">Ward {person.ward_number}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${person.status === "Active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{person.status}</span></div>
                    <div className="mt-3 space-y-1.5 text-xs text-slate-600"><p><span className="font-semibold text-slate-800">Contact:</span> {person.contact_number || "Not provided"}</p><p className="break-all"><span className="font-semibold text-slate-800">Email:</span> {person.email || "Not provided"}</p></div>
                    {isAdmin && <div className="mt-3 flex gap-2"><button type="button" onClick={() => openEditModal(person)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Edit</button><button type="button" onClick={() => void toggleStatus(person)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">{person.status === "Active" ? "Deactivate" : "Activate"}</button></div>}
                  </article>
                ))}
              </div>
            </>
          )}
          <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">Showing {filteredCouncillors.length} of {councillors.length} councillors</div>
        </section>
          </div>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 z-[60] h-1 w-full bg-green-950"><div className="h-full w-[28%] bg-[#F2C94C]"/></div>

      {modalOpen && isAdmin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="councillor-form-title">
          <div className="my-8 w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div><p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Councillor records</p><h2 id="councillor-form-title" className="mt-1 text-lg font-extrabold text-slate-900">{editingId ? "Edit councillor" : "Add councillor"}</h2><p className="mt-1 text-xs text-slate-500">Enter the councillor's ward and contact information.</p></div>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">✕</button>
            </div>
            <form onSubmit={saveCouncillor} className="space-y-4 p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">First name *</span><input required maxLength={80} value={form.first_name} onChange={(event) => setForm((current) => ({ ...current, first_name: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="First name" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Surname *</span><input required maxLength={80} value={form.surname} onChange={(event) => setForm((current) => ({ ...current, surname: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="Surname" /></label>
                <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Ward number *</span><select required value={form.ward_number} onChange={(event) => setForm((current) => ({ ...current, ward_number: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"><option value="">Select ward</option>{MUNICIPAL_WARD_NUMBERS.map((ward) => <option key={ward} value={ward}>Ward {ward}</option>)}</select><p className="mt-1 text-[11px] text-slate-500">Emalahleni Local Municipality has 34 wards. Select the councillor's official ward.</p></label>
                <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-700">Contact number *</span><input required inputMode="numeric" maxLength={10} value={form.contact_number} onChange={(event) => setForm((current) => ({ ...current, contact_number: event.target.value.replace(/\D/g, "").slice(0, 10) }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="0821234567" /></label>
                <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-700">Email address *</span><input required type="email" maxLength={254} value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" placeholder="councillor@emalahleni.gov.za" /></label>
                <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-700">Status</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as "Active" | "Inactive" }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600"><option value="Active">Active</option><option value="Inactive">Inactive</option></select></label>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button type="submit" disabled={saving} className="rounded-lg bg-emerald-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Saving..." : editingId ? "Save changes" : "Add councillor"}</button></div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}