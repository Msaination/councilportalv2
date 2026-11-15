

"use client";



import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

import Image from "next/image";

import Link from "next/link";



type SettingsData = {

  municipalityName: string;

  systemName: string;

  supportEmail: string;

  supportPhone: string;

  defaultPriority: string;

  complaintPrefix: string;

  targetResolutionDays: string;

  allowAnonymous: boolean;

  requireDepartment: boolean;

  requireSection: boolean;

  allowReassignment: boolean;

  notifyNewComplaint: boolean;

  notifyAssignment: boolean;

  notifyResolution: boolean;

  notifyOverdue: boolean;

  emailNotifications: boolean;

  sessionTimeout: string;

  requireStrongPassword: boolean;

  maintenanceMode: boolean;

};



const STORAGE_KEY = "emalahleni-system-settings-v1";



const defaultSettings: SettingsData = {

  municipalityName: "Emalahleni Local Municipality",

  systemName: "Complaints Management System",

  supportEmail: "",

  supportPhone: "",

  defaultPriority: "Medium",

  complaintPrefix: "CMP",

  targetResolutionDays: "7",

  allowAnonymous: true,

  requireDepartment: true,

  requireSection: true,

  allowReassignment: true,

  notifyNewComplaint: true,

  notifyAssignment: true,

  notifyResolution: true,

  notifyOverdue: true,

  emailNotifications: false,

  sessionTimeout: "30",

  requireStrongPassword: true,

  maintenanceMode: false,

};



type Tab =

  | "general"

  | "workflow"

  | "notifications"

  | "security"

  | "system";



const tabs: { id: Tab; label: string; description: string }[] = [

  {

    id: "general",

    label: "General Settings",

    description: "Municipal details and system information",

  },

  {

    id: "workflow",

    label: "Complaint Workflow",

    description: "Routing, priority and complaint handling",

  },

  {

    id: "notifications",

    label: "Notifications",

    description: "Complaint alerts and communication preferences",

  },

  {

    id: "security",

    label: "Security",

    description: "Session and account security preferences",

  },

  {

    id: "system",

    label: "System Settings",

    description: "Maintenance and system administration",

  },

];




function SidebarIcon({ name }: { name: string }) {
  const common = {
    className: "h-[17px] w-[17px]",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  const paths: Record<string, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="4" rx="1.5" /><rect x="14" y="10" width="7" height="11" rx="1.5" /><rect x="3" y="13" width="7" height="8" rx="1.5" /></>,
    complaints: <><path d="M8 10h8M8 14h5" /><path d="M20 11.5a8 8 0 1 1-3.2-6.4" /><path d="m15 3 3 3 3-3" /></>,
    departments: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5" /><path d="M9 9h.01M15 9h.01M9 12h.01M15 12h.01" /></>,
    reports: <><path d="M4 19V5M4 19h17" /><path d="M8 16v-4m4 4V8m4 8v-6m4 6V4" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.8 3.12-.09-.03a1.7 1.7 0 0 0-1.82.47l-.07.08h-3.6l-.02-.1a1.7 1.7 0 0 0-1.3-1.32l-.1-.02-1.8-3.12.07-.07a1.7 1.7 0 0 0 0-2.4l-.07-.07 1.8-3.12.1-.02a1.7 1.7 0 0 0 1.3-1.32l.02-.1h3.6l.07.08a1.7 1.7 0 0 0 1.82.47l.09-.03 1.8 3.12-.06.06A1.7 1.7 0 0 0 19.4 15Z" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  };
  return <svg {...common}>{paths[name] || paths.dashboard}</svg>;
}

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [currentUser, setCurrentUser] = useState({ name: "", email: "" });
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;

      if (error || !data.user) {
        router.replace("/login");
        return;
      }

      const user = data.user;
      const metadata = user.user_metadata ?? {};
      const name =
        metadata.full_name ||
        metadata.name ||
        [metadata.first_name, metadata.last_name].filter(Boolean).join(" ") ||
        user.email?.split("@")[0] ||
        "Signed-in user";

      setCurrentUser({ name, email: user.email ?? "" });
    }

    void loadCurrentUser();
    return () => { active = false; };
  }, [router, supabase]);

  async function handleSignOut() {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError("Unable to sign out. Please try again.");
      setSigningOut(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  const [settings, setSettings] =

    useState<SettingsData>(defaultSettings);

  const [loaded, setLoaded] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>("general");

  const [message, setMessage] = useState("");

  const [error, setError] = useState("");

  const [saving, setSaving] = useState(false);



  useEffect(() => {

    try {

      const stored = localStorage.getItem(STORAGE_KEY);



      if (stored) {

        const parsed = JSON.parse(stored);

        setSettings({ ...defaultSettings, ...parsed });

      }

    } catch {

      setError("Unable to load saved settings.");

    } finally {

      setLoaded(true);

    }

  }, []);



  function update<K extends keyof SettingsData>(

    key: K,

    value: SettingsData[K]

  ) {

    setSettings((current) => ({

      ...current,

      [key]: value,

    }));

    setMessage("");

    setError("");

  }



  function saveSettings() {

    setSaving(true);

    setMessage("");

    setError("");



    try {

      localStorage.setItem(

        STORAGE_KEY,

        JSON.stringify(settings)

      );

      setMessage("Settings saved successfully in this browser.");

    } catch {

      setError(

        "Unable to save settings. Check your browser storage."

      );

    } finally {

      setSaving(false);

    }

  }



  function resetSettings() {

    const confirmed = window.confirm(

      "Reset all settings to their default values?"

    );



    if (!confirmed) return;



    setSettings({ ...defaultSettings });



    try {

      localStorage.removeItem(STORAGE_KEY);

      setMessage("Settings have been reset to their defaults.");

      setError("");

    } catch {

      setError("Unable to reset saved settings.");

    }

  }



  function Toggle({

    label,

    description,

    checked,

    onChange,

  }: {

    label: string;

    description: string;

    checked: boolean;

    onChange: (value: boolean) => void;

  }) {

    return (

      <div className="flex items-center justify-between gap-4 py-4">

        <div className="min-w-0">

          <p className="text-sm font-semibold text-gray-800">

            {label}

          </p>

          <p className="mt-1 text-xs leading-5 text-gray-500">

            {description}

          </p>

        </div>



        <button

          type="button"

          role="switch"

          aria-checked={checked}

          aria-label={label}

          onClick={() => onChange(!checked)}

          className={`relative h-6 w-11 shrink-0 rounded-full transition ${

            checked ? "bg-emerald-700" : "bg-gray-300"

          }`}

        >

          <span

            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${

              checked ? "left-6" : "left-1"

            }`}

          />

        </button>

      </div>

    );

  }



  function Field({

    label,

    value,

    onChange,

    placeholder,

    type = "text",

    description,

  }: {

    label: string;

    value: string;

    onChange: (value: string) => void;

    placeholder?: string;

    type?: string;

    description?: string;

  }) {

    return (

      <div>

        <label className="mb-1.5 block text-xs font-semibold text-gray-700">

          {label}

        </label>



        <input

          type={type}

          value={value}

          min={type === "number" ? 1 : undefined}

          onChange={(event) => onChange(event.target.value)}

          placeholder={placeholder}

          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"

        />



        {description && (

          <p className="mt-1.5 text-[11px] leading-4 text-gray-500">

            {description}

          </p>

        )}

      </div>

    );

  }



  function SectionHeading({

    title,

    description,

  }: {

    title: string;

    description: string;

  }) {

    return (

      <div className="mb-4">

        <h3 className="text-sm font-bold text-gray-900">

          {title}

        </h3>

        <p className="mt-1 text-xs leading-5 text-gray-500">

          {description}

        </p>

      </div>

    );

  }



  function renderTab() {

    switch (activeTab) {

      case "general":

        return (

          <div className="space-y-6">

            <section className="rounded-xl border border-gray-200 bg-white p-5">

              <SectionHeading

                title="Municipal Information"

                description="Configure the organisation details displayed in the system."

              />



              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

                <Field

                  label="Municipality Name"

                  value={settings.municipalityName}

                  onChange={(value) =>

                    update("municipalityName", value)

                  }

                  placeholder="Municipality name"

                />



                <Field

                  label="System Name"

                  value={settings.systemName}

                  onChange={(value) =>

                    update("systemName", value)

                  }

                  placeholder="System name"

                />



                <Field

                  label="Support Email"

                  type="email"

                  value={settings.supportEmail}

                  onChange={(value) =>

                    update("supportEmail", value)

                  }

                  placeholder="support@example.gov.za"

                />



                <Field

                  label="Support Telephone"

                  value={settings.supportPhone}

                  onChange={(value) =>

                    update("supportPhone", value)

                  }

                  placeholder="Enter contact number"

                />

              </div>

            </section>



            <section className="rounded-xl border border-gray-200 bg-white p-5">

              <SectionHeading

                title="Default Preferences"

                description="Choose the default values used when complaints are registered."

              />



              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

                <div>

                  <label className="mb-1.5 block text-xs font-semibold text-gray-700">

                    Default Complaint Priority

                  </label>

                  <select

                    value={settings.defaultPriority}

                    onChange={(event) =>

                      update("defaultPriority", event.target.value)

                    }

                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600"

                  >

                    <option>Low</option>

                    <option>Medium</option>

                    <option>High</option>

                    <option>Critical</option>

                  </select>

                </div>



                <Field

                  label="Complaint Reference Prefix"

                  value={settings.complaintPrefix}

                  onChange={(value) =>

                    update(

                      "complaintPrefix",

                      value.toUpperCase().replace(/[^A-Z0-9-]/g, "")

                    )

                  }

                  placeholder="CMP"

                  description="Example: CMP-2026-001. Changing this does not renumber existing complaints."

                />

              </div>

            </section>

          </div>

        );



      case "workflow":

        return (

          <div className="space-y-6">

            <section className="rounded-xl border border-gray-200 bg-white p-5">

              <SectionHeading

                title="Complaint Routing"

                description="Set expectations for how complaints move through the municipality."

              />



              <Toggle

                label="Require a Directorate"

                description="A complaint should be routed to a responsible directorate."

                checked={settings.requireDepartment}

                onChange={(value) =>

                  update("requireDepartment", value)

                }

              />



              <div className="border-t border-gray-100">

                <Toggle

                  label="Require a Section"

                  description="Complaints should be directed to a specific section within the directorate."

                  checked={settings.requireSection}

                  onChange={(value) =>

                    update("requireSection", value)

                  }

                />

              </div>



              <div className="border-t border-gray-100">

                <Toggle

                  label="Allow Complaint Reassignment"

                  description="Permit authorised supervisors to transfer complaints to another responsible section."

                  checked={settings.allowReassignment}

                  onChange={(value) =>

                    update("allowReassignment", value)

                  }

                />

              </div>



              <div className="border-t border-gray-100">

                <Toggle

                  label="Allow Anonymous Complaints"

                  description="Permit complaints to be captured without requiring the complainant's identity."

                  checked={settings.allowAnonymous}

                  onChange={(value) =>

                    update("allowAnonymous", value)

                  }

                />

              </div>

            </section>



            <section className="rounded-xl border border-gray-200 bg-white p-5">

              <SectionHeading

                title="Resolution Targets"

                description="Set the default target used for complaint management."

              />



              <Field

                label="Target Resolution Period (Days)"

                type="number"

                value={settings.targetResolutionDays}

                onChange={(value) =>

                  update("targetResolutionDays", value)

                }

                placeholder="7"

                description="This is a configurable demonstration value, not a verified statutory deadline. Actual targets may depend on complaint type and municipal policy."

              />



              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">

                Changing these settings does not automatically change

                complaint routing or deadlines in other pages. Connect

                these settings to the complaint workflow and backend

                to apply them system-wide.

              </div>

            </section>

          </div>

        );



      case "notifications":

        return (

          <div className="space-y-6">

            <section className="rounded-xl border border-gray-200 bg-white p-5">

              <SectionHeading

                title="Complaint Notifications"

                description="Choose which events should trigger notification handling."

              />



              <Toggle

                label="New Complaint Received"

                description="Notify the responsible team when a new complaint is captured."

                checked={settings.notifyNewComplaint}

                onChange={(value) =>

                  update("notifyNewComplaint", value)

                }

              />



              <div className="border-t border-gray-100">

                <Toggle

                  label="Complaint Assigned"

                  description="Notify an official when a supervisor assigns a complaint."

                  checked={settings.notifyAssignment}

                  onChange={(value) =>

                    update("notifyAssignment", value)

                  }

                />

              </div>



              <div className="border-t border-gray-100">

                <Toggle

                  label="Complaint Resolved"

                  description="Enable a notification event when a complaint is marked resolved."

                  checked={settings.notifyResolution}

                  onChange={(value) =>

                    update("notifyResolution", value)

                  }

                />

              </div>



              <div className="border-t border-gray-100">

                <Toggle

                  label="Overdue Complaint Alert"

                  description="Enable alerts for complaints that exceed their applicable target."

                  checked={settings.notifyOverdue}

                  onChange={(value) =>

                    update("notifyOverdue", value)

                  }

                />

              </div>

            </section>



            <section className="rounded-xl border border-gray-200 bg-white p-5">

              <SectionHeading

                title="Notification Channels"

                description="Configure the preferred delivery method for future integration."

              />



              <Toggle

                label="Email Notifications"

                description="Enable email notification handling when an email service is configured."

                checked={settings.emailNotifications}

                onChange={(value) =>

                  update("emailNotifications", value)

                }

              />



              <p className="mt-2 rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-500">

                These switches save preferences only. Email and other

                notifications will not be delivered until a notification

                service is implemented.

              </p>

            </section>

          </div>

        );



      case "security":

        return (

          <div className="space-y-6">

            <section className="rounded-xl border border-gray-200 bg-white p-5">

              <SectionHeading

                title="Session Management"

                description="Configure the intended session timeout for authenticated users."

              />



              <div>

                <label className="mb-1.5 block text-xs font-semibold text-gray-700">

                  Session Timeout

                </label>

                <select

                  value={settings.sessionTimeout}

                  onChange={(event) =>

                    update("sessionTimeout", event.target.value)

                  }

                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-600"

                >

                  <option value="15">15 minutes</option>

                  <option value="30">30 minutes</option>

                  <option value="60">60 minutes</option>

                  <option value="120">120 minutes</option>

                </select>

                <p className="mt-1.5 text-[11px] leading-4 text-gray-500">

                  This preference does not terminate sessions until

                  implemented by your authentication system.

                </p>

              </div>



              <div className="mt-3 border-t border-gray-100">

                <Toggle

                  label="Require Strong Passwords"

                  description="Set the intended policy for stronger passwords when creating accounts."

                  checked={settings.requireStrongPassword}

                  onChange={(value) =>

                    update("requireStrongPassword", value)

                  }

                />

              </div>

            </section>



            <section className="rounded-xl border border-red-200 bg-white p-5">

              <SectionHeading

                title="Security Recommendations"

                description="Important controls for the production system."

              />



              <ul className="space-y-3 text-xs leading-5 text-gray-600">

                <li>

                  • Enforce permissions on the server, not only by

                  hiding navigation links.

                </li>

                <li>

                  • Store password hashes using a secure authentication

                  provider; never store plain-text passwords.

                </li>

                <li>

                  • Restrict user administration to authorised

                  administrators.

                </li>

                <li>

                  • Record sensitive actions in an audit log.

                </li>

                <li>

                  • Protect personal information and enforce appropriate

                  access controls.

                </li>

              </ul>

            </section>

          </div>

        );



      case "system":

        return (

          <div className="space-y-6">

            <section className="rounded-xl border border-gray-200 bg-white p-5">

              <SectionHeading

                title="System Availability"

                description="Maintenance mode should be controlled by a production backend."

              />



              <Toggle

                label="Maintenance Mode"

                description="Save your intended maintenance-mode preference. This switch does not disable the application."

                checked={settings.maintenanceMode}

                onChange={(value) =>

                  update("maintenanceMode", value)

                }

              />



              {settings.maintenanceMode && (

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">

                  Maintenance mode is selected in the settings form.

                  The website remains available until backend

                  maintenance handling is implemented.

                </div>

              )}

            </section>



            <section className="rounded-xl border border-gray-200 bg-white p-5">

              <SectionHeading

                title="Current Configuration"

                description="Review the preferences currently shown in this browser."

              />



              <div className="divide-y divide-gray-100">

                {[

                  ["Municipality", settings.municipalityName],

                  ["System", settings.systemName],

                  ["Default Priority", settings.defaultPriority],

                  ["Complaint Prefix", settings.complaintPrefix],

                  [

                    "Resolution Target",

                    `${settings.targetResolutionDays || "Not set"} days`,

                  ],

                  [

                    "Anonymous Complaints",

                    settings.allowAnonymous ? "Allowed" : "Not allowed",

                  ],

                  [

                    "Email Notifications",

                    settings.emailNotifications ? "Enabled" : "Disabled",

                  ],

                  ["Storage", "Browser local storage"],

                ].map(([label, value]) => (

                  <div

                    key={label}

                    className="flex items-start justify-between gap-4 py-3"

                  >

                    <span className="text-xs text-gray-500">

                      {label}

                    </span>

                    <span className="max-w-[60%] break-words text-right text-xs font-semibold text-gray-800">

                      {value}

                    </span>

                  </div>

                ))}

              </div>

            </section>



            <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">

              <h3 className="text-sm font-bold text-amber-950">

                Reset Settings

              </h3>

              <p className="mt-1 text-xs leading-5 text-amber-900">

                Reset the preferences in this browser to their default

                values. This does not delete complaints or user accounts.

              </p>

              <button

                type="button"

                onClick={resetSettings}

                className="mt-4 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"

              >

                Reset to Defaults

              </button>

            </section>

          </div>

        );

    }

  }



  return (

    <div className="min-h-screen bg-[#f7f9f8] text-gray-800">

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-green-950/10 bg-[#14532d] shadow-sm lg:flex">
        {/* Municipal branding — kept consistent with Dashboard */}
        <div className="relative border-b border-green-900/10 bg-gradient-to-br from-white via-white to-green-50 px-4 py-4">
          <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-green-900 via-green-700 to-[#F2C94C]" />
          <div className="flex items-center gap-3">
            <div className="relative flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-2xl border border-green-900/10 bg-white p-2 shadow-sm">
              <Image src="/Emalahleni%20Logo.png" alt="Emalahleni Local Municipality" width={56} height={56} className="h-full w-full object-contain" />
              <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-[#F2C94C]" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-green-800">MPUMALANGA</p>
              <h2 className="mt-1 text-[16px] font-black leading-tight tracking-tight text-slate-950">EMALAHLENI</h2>
              <p className="mt-1 text-[10px] font-semibold text-slate-600">Local Municipality</p>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="h-[3px] w-6 rounded-full bg-green-800" />
                <span className="h-[3px] w-3 rounded-full bg-[#F2C94C]" />
                <span className="ml-1 truncate text-[9px] text-slate-400">Serving our community</span>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto bg-[#14532d] px-3 py-5 text-white">
          <div className="mb-3 flex items-center justify-between px-3">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE082]">MAIN MENU</span>
            <span className="text-[9px] font-semibold text-white/50">01</span>
          </div>

          <div className="space-y-1">
            {[
              { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
              { label: "Complaints", href: "/complaints", icon: "complaints" },
              { label: "Departments", href: "/departments", icon: "departments" },
              { label: "Reports", href: "/reports", icon: "reports" },
            ].map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                  className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all duration-200 ${active ? "bg-white/10 text-white shadow-sm shadow-black/10" : "text-white/85 hover:bg-white/10 hover:text-white"}`}>
                  {active && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-white/80" />}
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${active ? "bg-white/10 text-[#FFE082]" : "bg-white/10 text-white/70 group-hover:bg-white/15 group-hover:text-[#FFE082]"}`}>
                    <SidebarIcon name={item.icon} />
                  </span>
                  <span className="min-w-0 flex-1 text-[11px] font-bold">{item.label}</span>
                  <span className={`transition group-hover:translate-x-0.5 ${active ? "text-white/70" : "text-white/40 opacity-0 group-hover:opacity-100 group-hover:text-white/80"}`}><SidebarIcon name="arrow" /></span>
                </Link>
              );
            })}
          </div>

          <div className="mb-3 mt-7 flex items-center justify-between px-3">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE082]">USER MANAGEMENT</span>
            <span className="text-[9px] font-semibold text-white/50">02</span>
          </div>

          <div className="space-y-1">
            {[
              { label: "Users & Roles", href: "/users", icon: "users" },
              { label: "Staff", href: "/staff", icon: "users" },
              { label: "Settings", href: "/settings", icon: "settings" },
            ].map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                  className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all duration-200 ${active ? "bg-white/10 text-white shadow-sm shadow-black/10" : "text-white/85 hover:bg-white/10 hover:text-white"}`}>
                  {active && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-white/80" />}
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${active ? "bg-white/10 text-[#FFE082]" : "bg-white/10 text-white/70 group-hover:bg-white/15 group-hover:text-[#FFE082]"}`}>
                    <SidebarIcon name={item.icon} />
                  </span>
                  <span className="min-w-0 flex-1 text-[11px] font-bold">{item.label}</span>
                  <span className={`transition group-hover:translate-x-0.5 ${active ? "text-white/70" : "text-white/40 opacity-0 group-hover:opacity-100 group-hover:text-white/80"}`}><SidebarIcon name="arrow" /></span>
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>



      <main className="min-h-screen lg:ml-[264px]">

        <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-7">

          <div>

            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">

              Complaints Management System

            </p>

            <h1 className="mt-1 text-lg font-bold text-gray-900">

              Settings

            </h1>

          </div>



          <div className="flex items-center gap-2">

            <div className="hidden text-right sm:block">

              <p className="max-w-[220px] truncate text-xs font-semibold text-gray-800">
                {currentUser.name || "Loading user..."}
              </p>
              <p className="max-w-[220px] truncate text-[10px] text-gray-500">
                {currentUser.email}
              </p>

            </div>

            <div
              title={currentUser.name || "Signed-in user"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold uppercase text-emerald-800"
            >
              {(currentUser.name || currentUser.email || "U").trim().charAt(0)}
            </div>

          </div>

        </header>



        <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-7">

          <div>

            <h2 className="text-xl font-bold text-gray-900">

              System Configuration

            </h2>

            <p className="mt-1 text-sm text-gray-500">

              Manage general preferences, complaint handling and

              administrative options.

            </p>

          </div>



          {(message || error) && (

            <div

              role="status"

              className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${

                error

                  ? "border-red-200 bg-red-50 text-red-800"

                  : "border-emerald-200 bg-emerald-50 text-emerald-800"

              }`}

            >

              <span>{error || message}</span>

              <button

                type="button"

                onClick={() => {

                  setMessage("");

                  setError("");

                }}

                aria-label="Dismiss message"

                className="font-bold"

              >

                ×

              </button>

            </div>

          )}



          <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">

            <aside className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">

              <p className="px-3 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">

                Settings Menu

              </p>



              <nav className="space-y-1">

                {tabs.map((tab) => (

                  <button

                    key={tab.id}

                    type="button"

                    onClick={() => setActiveTab(tab.id)}

                    className={`w-full rounded-lg px-3 py-3 text-left transition ${

                      activeTab === tab.id

                        ? "bg-emerald-50 text-emerald-900"

                        : "text-gray-600 hover:bg-gray-50"

                    }`}

                  >

                    <span className="block text-xs font-semibold">

                      {tab.label}

                    </span>

                    <span

                      className={`mt-1 block text-[10px] leading-4 ${

                        activeTab === tab.id

                          ? "text-emerald-800"

                          : "text-gray-400"

                      }`}

                    >

                      {tab.description}

                    </span>

                  </button>

                ))}

              </nav>

            </aside>



            <div className="min-w-0 space-y-5">

              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">

                <div>

                  <h2 className="text-base font-bold text-gray-900">

                    {tabs.find((tab) => tab.id === activeTab)?.label}

                  </h2>

                  <p className="mt-1 text-xs text-gray-500">

                    {tabs.find((tab) => tab.id === activeTab)?.description}

                  </p>

                </div>



                <button

                  type="button"

                  onClick={saveSettings}

                  disabled={!loaded || saving}

                  className="rounded-lg bg-emerald-700 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"

                >

                  {saving ? "Saving..." : "Save Settings"}

                </button>

              </div>



              {loaded ? (

                renderTab()

              ) : (

                <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">

                  Loading settings...

                </div>

              )}



              <div className="flex flex-col justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center">

                <p className="text-[11px] leading-5 text-gray-500">

                  Changes are saved locally in this browser. A production

                  database and backend integration are required for

                  municipality-wide settings.

                </p>

                <button

                  type="button"

                  onClick={saveSettings}

                  disabled={!loaded || saving}

                  className="shrink-0 rounded-lg bg-emerald-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"

                >

                  Save Changes

                </button>

              </div>

            </div>

          </div>

        </div>

      </main>

    </div>

  );

}


