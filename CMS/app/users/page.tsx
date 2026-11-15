"use client";



import {

  useCallback,

  useEffect,

  useMemo,

  useState,

  type FormEvent,

  type ReactNode,

} from "react";

import Image from "next/image";

import Link from "next/link";

import { createClient } from "@/lib/supabase/client";



type Role =

  | "Administrator"

  | "Call Centre Agent"

  | "Supervisor"

  | "Clerk"

  | "Official"

  | "Department Manager"
  | "Assistant Manager"
  | "Director"
  | "Municipal Manager"
  | "Communications";



type StaffProfile = {

  id: string;

  full_name: string;

  username: string | null;

  email: string | null;

  phone: string | null;

  job_title: string | null;

  department_id: string | null;

  section_id: string | null;

  access_level: string | null;

  is_active: boolean | null;

};



type Department = {

  id: string;

  name: string;

};



type Section = {

  id: string;

  name: string;

  department_id: string;

};



type UserRow = StaffProfile & {

  department_name: string;

  section_name: string;

  pages: string[];

  actions: string[];

};



type FormState = {

  first_name: string;

  surname: string;

  username: string;

  email: string;

  phone: string;

  password: string;

  job_title: string;

  access_level: Role;

  department_id: string;

  section_id: string;

  is_active: boolean;

  pages: string[];

  actions: string[];

};



const supabase = createClient();



const roles: Role[] = [

  "Administrator",

  "Call Centre Agent",

  "Supervisor",

  "Clerk",

  "Official",

  "Department Manager",
  "Assistant Manager",
  "Director",
  "Municipal Manager",
  "Communications",

];



const pagePermissions = [

  {

    page: "Dashboard",

    path: "/dashboard",

    description: "View dashboard and complaint summaries",

  },

  {

    page: "Complaints",

    path: "/complaints",

    description: "Capture and manage complaints",

  },

  {

    page: "Departments",

    path: "/departments",

    description: "View department and section complaint queues",

  },

  {

    page: "Reports",

    path: "/reports",

    description: "View and export reports",

  },

  {

    page: "Users & Roles",

    path: "/users",

    description: "Manage user accounts and permissions",

  },

  {

    page: "Settings",

    path: "/settings",

    description: "Manage system settings",

  },

];



const actions = [

  { id: "view", label: "View records" },

  { id: "create", label: "Create complaints" },

  { id: "edit", label: "Edit complaints" },

  { id: "assign", label: "Assign complaints" },

  { id: "resolve", label: "Resolve complaints" },

  { id: "delete", label: "Delete records" },

  { id: "export", label: "Export reports" },

];



const roleDefaults: Record<Role, { pages: string[]; actions: string[] }> = {

  Administrator: {

    pages: pagePermissions.map((p) => p.page),

    actions: actions.map((a) => a.id),

  },

  "Call Centre Agent": {

    pages: ["Dashboard", "Complaints", "Departments"],

    actions: ["view", "create", "edit"],

  },

  Supervisor: {

    pages: ["Dashboard", "Complaints", "Departments", "Reports"],

    actions: ["view", "edit", "assign", "resolve", "export"],

  },

  Clerk: {

    pages: ["Dashboard", "Complaints", "Departments", "Reports"],

    actions: ["view", "edit", "assign", "resolve", "export"],

  },

  Official: {

    pages: ["Dashboard", "Complaints", "Departments"],

    actions: ["view", "edit"],

  },

  "Department Manager": {

    pages: ["Dashboard", "Complaints", "Departments", "Reports"],

    actions: ["view", "edit", "assign", "resolve", "export"],

  },

  "Assistant Manager": {
    pages: ["Dashboard", "Reports"],
    actions: ["view", "export"],
  },
  Director: {
    pages: ["Dashboard", "Reports"],
    actions: ["view", "export"],
  },
  "Municipal Manager": {
    pages: ["Dashboard", "Reports", "Departments"],
    actions: ["view", "export"],
  },
  Communications: {
    pages: ["Dashboard"],
    actions: ["view"],
  },

};



const blankForm = (): FormState => ({

  first_name: "",

  surname: "",

  username: "",

  email: "",

  phone: "",

  password: "",

  job_title: "",

  access_level: "Call Centre Agent",

  department_id: "",

  section_id: "",

  is_active: true,

  ...roleDefaults["Call Centre Agent"],

});



const inputClass =

  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";



// These sections remain in Supabase for historical records,

// but are hidden from new user assignments.

const hiddenSectionNames = new Set([

  "committee support",

  "communications and public relations",

  "communications and public support",

  "customer care and call centre",

  "legal services",

  "records and archives",

]);



const technicalServicesSectionOrder = [

  "Electrical",

  "Water Supply",

  "Sanitation and Sewerage",

  "Roads and Stormwater",

] as const;



const technicalServicesSectionAliases: Record<

  (typeof technicalServicesSectionOrder)[number],

  string[]

> = {

  Electrical: ["electrical", "electricity", "electrical services", "electricity services"],

  "Water Supply": ["water supply", "water infrastructure", "water services"],

  "Sanitation and Sewerage": [

    "sanitation and sewerage",

    "sewer infrastructure",

    "sanitation services",

    "sewerage",

  ],

  "Roads and Stormwater": [

    "roads and stormwater",

    "roads and road maintenance",

    "roads maintenance",

    "road maintenance",

    "stormwater and drainage",

    "stormwater drainage",

  ],

};



function normalizeName(value: string) {

  return value.trim().toLowerCase().replace(/\s+/g, " ");

}



function isTechnicalServices(name: string) {

  return normalizeName(name) === "technical services";

}



function technicalSectionLabel(sectionName: string) {

  const normalized = normalizeName(sectionName);

  return (

    technicalServicesSectionOrder.find((label) =>

      technicalServicesSectionAliases[label].includes(normalized)

    ) ?? sectionName

  );

}



export default function UsersPage() {

  const [users, setUsers] = useState<UserRow[]>([]);

  const [departments, setDepartments] = useState<Department[]>([]);

  const [sections, setSections] = useState<Section[]>([]);

  const [departmentSections, setDepartmentSections] = useState<Section[]>([]);

  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [showOtherDepartment, setShowOtherDepartment] = useState(false);
  const [showOtherSection, setShowOtherSection] = useState(false);
  const [otherDepartmentName, setOtherDepartmentName] = useState("");
  const [otherSectionName, setOtherSectionName] = useState("");



  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");

  const [notice, setNotice] = useState("");

  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);

  const [editing, setEditing] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(blankForm());

  const [tab, setTab] = useState<"details" | "permissions">("details");



  const loadData = useCallback(async () => {

    setLoading(true);

    setError("");



    try {

      const { data: sessionData, error: sessionError } =

        await supabase.auth.getSession();



      if (sessionError || !sessionData.session?.access_token) {

        throw new Error("Your session could not be verified. Sign in again.");

      }



      const response = await fetch("/api/admin/users", {

        method: "GET",

        headers: {

          Accept: "application/json",

          Authorization: `Bearer ${sessionData.session.access_token}`,

        },

        cache: "no-store",

      });



      const responseText = await response.text();



      let result: {

        error?: string;

        details?: string;

        users?: StaffProfile[];

        departments?: Department[];

        sections?: Section[];

        permissions?: Record<

          string,

          { pages?: string[]; actions?: string[] }

        >;

      };



      try {

        result = JSON.parse(responseText) as typeof result;

      } catch {

        console.error("Users API returned a non-JSON response:", {

          status: response.status,

          response: responseText.slice(0, 500),

        });



        throw new Error(

          response.status === 404 || response.status === 405

            ? "The Users API route is missing its GET handler. Add GET to app/api/admin/users/route.ts."

            : "The server returned an empty or invalid response. Check the VS Code terminal for the API error."

        );

      }



      if (!response.ok) {

        const message = [result.error, result.details]

          .filter(Boolean)

          .join(": ");



        throw new Error(

          message || `Could not load staff accounts (${response.status}).`

        );

      }



      const depts = (result.departments ?? []) as Department[];

      const sects = (result.sections ?? []) as Section[];



      const orderedDepartments = [...depts].sort((a, b) => {

        if (isTechnicalServices(a.name)) return -1;

        if (isTechnicalServices(b.name)) return 1;

        return a.name.localeCompare(b.name);

      });



      setDepartments(orderedDepartments);

      setSections(sects);



      const permissionMap = (result.permissions ?? {}) as Record<

        string,

        { pages?: string[]; actions?: string[] }

      >;



      const profileRows = (result.users ?? []) as StaffProfile[];



      setUsers(

        profileRows.map((p: StaffProfile) => {

          const legacyRole = String(p.access_level ?? "").toLowerCase();



          const role = (

            roles.includes(p.access_level as Role)

              ? p.access_level

              : legacyRole.includes("administrator")

                ? "Administrator"

                : legacyRole.includes("manager")

                  ? "Department Manager"

                  : legacyRole.includes("supervisor")

                    ? "Supervisor"

                    : legacyRole.includes("clerk")

                      ? "Clerk"

                      : "Official"

          ) as Role;



          return {

            ...p,

            access_level: role,

            department_name:

              depts.find((d) => d.id === p.department_id)?.name ??

              "Not assigned",

            section_name:

              sects.find((section) => section.id === p.section_id)?.name ??

              "Not assigned",

            pages: permissionMap[p.id]?.pages ?? roleDefaults[role].pages,

            actions:

              permissionMap[p.id]?.actions ?? roleDefaults[role].actions,

          };

        })

      );

    } catch (e) {

      setError(

        e instanceof Error ? e.message : "Could not load staff accounts."

      );

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    void loadData();

  }, [loadData]);



  const filteredUsers = useMemo(() => {

    const term = search.trim().toLowerCase();



    return users.filter((u: UserRow) =>

      [

        u.full_name,

        u.username ?? "",

        u.email ?? "",

        u.phone ?? "",

        u.department_name,

        u.section_name,

      ].some((v: string) => v.toLowerCase().includes(term))

    );

  }, [users, search]);



  const selectedDepartment = departments.find(

    (department) => String(department.id) === String(form.department_id)

  );



  const selectedSections = departmentSections

    .filter(

      (section: Section) =>

        String(section.department_id) === String(form.department_id) &&

        !hiddenSectionNames.has(normalizeName(section.name)) &&

        (!selectedDepartment ||

          !isTechnicalServices(selectedDepartment.name) ||

          technicalServicesSectionOrder.some((label) =>

            technicalServicesSectionAliases[label].includes(

              normalizeName(section.name)

            )

          ))

    )

    .sort((a, b) => {

      if (selectedDepartment && isTechnicalServices(selectedDepartment.name)) {

        return (

          technicalServicesSectionOrder.indexOf(

            technicalSectionLabel(a.name) as (typeof technicalServicesSectionOrder)[number]

          ) -

          technicalServicesSectionOrder.indexOf(

            technicalSectionLabel(b.name) as (typeof technicalServicesSectionOrder)[number]

          )

        );

      }

      return a.name.localeCompare(b.name);

    });



  const activeCount = users.filter(

    (u: UserRow) => u.is_active !== false

  ).length;



  const loadDepartmentSections = useCallback(

    async (departmentId: string) => {

      setDepartmentSections([]);



      if (!departmentId) {

        setSectionsLoading(false);

        return;

      }



      setSectionsLoading(true);



      const { data, error: sectionError } = await supabase

        .from("sections")

        .select("id,name,department_id")

        .eq("department_id", departmentId)

        .order("name", { ascending: true });



      if (sectionError) {

        setError(

          `Could not load sections for this department: ${sectionError.message}`

        );

        setDepartmentSections([]);

      } else {

        setDepartmentSections((data ?? []) as Section[]);

      }



      setSectionsLoading(false);

    },

    []

  );



  function openAdd() {

    setEditing(null);

    setForm(blankForm());

    setDepartmentSections([]);

    setSectionsLoading(false);

    setTab("details");

    setError("");

    setNotice("");

    setShowForm(true);

  }



  function openEdit(user: UserRow) {

    setEditing(user.id);

    setTab("details");

    setError("");

    setNotice("");



    const nameParts = user.full_name.trim().split(/\s+/);

    const first_name = nameParts.shift() ?? "";

    const surname = nameParts.join(" ");



    const legacyRole = String(user.access_level ?? "").toLowerCase();



    const access_level = (

      roles.includes(user.access_level as Role)

        ? user.access_level

        : legacyRole.includes("administrator")

          ? "Administrator"

          : legacyRole.includes("manager")

            ? "Department Manager"

            : legacyRole.includes("supervisor")

              ? "Supervisor"

              : legacyRole.includes("clerk")

                ? "Clerk"

                : "Official"

    ) as Role;



    setForm({

      first_name,

      surname,

      username: user.username ?? "",

      email: user.email ?? "",

      phone: user.phone ?? "",

      password: "",

      job_title: user.job_title ?? "",

      access_level,

      department_id: user.department_id ?? "",

      section_id: user.section_id ?? "",

      is_active: user.is_active !== false,

      pages: [...user.pages],

      actions: [...user.actions],

    });



    setShowForm(true);



    if (user.department_id) {

      void loadDepartmentSections(user.department_id);

    } else {

      setDepartmentSections([]);

    }

  }



  function setField<K extends keyof FormState>(

    key: K,

    value: FormState[K]

  ) {

    setForm((prev: FormState) => ({

      ...prev,

      [key]: value,

    }));

  }



  function setRole(role: Role) {

    const municipalityWide = ["Call Centre Agent", "Municipal Manager", "Communications"].includes(role);
    const departmentWide = ["Department Manager", "Assistant Manager", "Director"].includes(role);

    setForm((prev: FormState) => ({

      ...prev,

      access_level: role,
      department_id: municipalityWide ? "" : prev.department_id,
      section_id: municipalityWide || departmentWide ? "" : prev.section_id,
      pages: [...roleDefaults[role].pages],

      actions: [...roleDefaults[role].actions],

    }));

    setShowOtherDepartment(false);
    setShowOtherSection(false);
    setOtherDepartmentName("");
    setOtherSectionName("");
    if (municipalityWide) setDepartmentSections([]);
    else if (departmentWide) setShowOtherSection(false);

  }



  function toggleList(field: "pages" | "actions", value: string) {

    setForm((prev: FormState) => ({

      ...prev,

      [field]: prev[field].includes(value)

        ? prev[field].filter((v: string) => v !== value)

        : [...prev[field], value],

    }));

  }



  async function saveUser(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();

    setError("");

    setNotice("");



    if (

      !form.first_name.trim() ||

      !form.surname.trim() ||

      !form.username.trim() ||

      !form.phone.trim()

    ) {

      setError(

        "First name, surname, username and contact number are required."

      );

      setTab("details");

      return;

    }



    if (!/^\d{10}$/.test(form.phone.trim())) {

      setError("Contact number must contain exactly 10 digits.");

      setTab("details");

      return;

    }



    if (!editing && form.password.length < 8) {

      setError("Set a temporary password of at least 8 characters.");

      setTab("details");

      return;

    }



    const roleNeedsDepartment = ["Supervisor", "Clerk", "Official", "Department Manager", "Assistant Manager", "Director"].includes(form.access_level);
    const roleNeedsSection = ["Supervisor", "Clerk", "Official"].includes(form.access_level);

    if (roleNeedsDepartment && !form.department_id) {
      setError("Select a department for this staff member.");
      setTab("details");
      return;
    }

    if (roleNeedsSection && !form.section_id) {
      setError("Select a section for this staff member.");
      setTab("details");
      return;
    }



    if (!form.pages.length) {

      setError("Select at least one page permission.");

      setTab("permissions");

      return;

    }



    setSaving(true);



    try {

      const { data: sessionData, error: sessionError } =

        await supabase.auth.getSession();



      if (sessionError || !sessionData.session?.access_token) {

        throw new Error("Your session could not be verified. Sign in again.");

      }



      const response = await fetch("/api/admin/users", {

        method: editing ? "PATCH" : "POST",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${sessionData.session.access_token}`,

        },

        body: JSON.stringify({

          id: editing,

          first_name: form.first_name.trim(),

          surname: form.surname.trim(),

          full_name: `${form.first_name.trim()} ${form.surname.trim()}`.trim(),

          username: form.username.trim(),

          email: form.email.trim() || null,

          phone: form.phone.trim(),

          password: form.password || undefined,

          job_title: form.job_title.trim(),

          access_level: form.access_level,

          department_id: form.department_id || null,

          section_id: form.section_id || null,

          is_active: form.is_active,

          pages: form.pages,

          actions: form.actions,

        }),

      });



      const responseText = await response.text();



      let result: {

        success?: boolean;

        error?: string;

        details?: string;

      } = {};



      try {

        result = JSON.parse(responseText) as typeof result;

      } catch {

        console.error("Users API returned a non-JSON response:", {

          status: response.status,

          response: responseText.slice(0, 500),

        });



        throw new Error(

          response.status === 404

            ? "The Users API route was not found. Check app/api/admin/users/route.ts."

            : "The server returned an HTML error page instead of JSON. Check the VS Code terminal for the API error."

        );

      }



      if (!response.ok) {

        const message = [result.error, result.details]

          .filter(Boolean)

          .join(": ");



        throw new Error(

          message || `Unable to save user (${response.status}).`

        );

      }



      setShowForm(false);

      setNotice(

        editing

          ? "User updated successfully."

          : "User created successfully."

      );



      await loadData();

    } catch (e) {

      setError(

        e instanceof Error ? e.message : "An unexpected error occurred."

      );

    } finally {

      setSaving(false);

    }

  }



  async function changeStatus(user: UserRow) {

    setError("");

    setNotice("");



    try {

      const { data } = await supabase.auth.getSession();



      if (!data.session?.access_token) {

        throw new Error("Please sign in again.");

      }



      const response = await fetch("/api/admin/users", {

        method: "PATCH",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${data.session.access_token}`,

        },

        body: JSON.stringify({

          id: user.id,

          is_active: user.is_active === false,

        }),

      });



      const responseText = await response.text();



      let result: {

        success?: boolean;

        error?: string;

        details?: string;

      } = {};



      try {

        result = JSON.parse(responseText) as typeof result;

      } catch {

        console.error("Users API returned a non-JSON response:", {

          status: response.status,

          response: responseText.slice(0, 500),

        });



        throw new Error(

          response.status === 404

            ? "The Users API route was not found. Check app/api/admin/users/route.ts."

            : "The server returned an HTML error page instead of JSON. Check the VS Code terminal for the API error."

        );

      }



      if (!response.ok) {

        const message = [result.error, result.details]

          .filter(Boolean)

          .join(": ");



        throw new Error(

          message || `Could not update account status (${response.status}).`

        );

      }



      setNotice(

        `Account ${user.is_active === false ? "activated" : "deactivated"}.`

      );



      await loadData();

    } catch (e) {

      setError(

        e instanceof Error

          ? e.message

          : "Could not update account status."

      );

    }

  }



  return (

    <div className="min-h-screen bg-[#f6f8f6] text-gray-800">

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col bg-[#14532d] text-white lg:flex">

        <div className="flex h-[156px] shrink-0 items-center gap-3 bg-white px-4 text-[#102d24]">

          <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-[23px] border-[4px] border-[#47b15d] bg-white">

            <Image src="/Emalahleni%20Logo.png" alt="Emalahleni Local Municipality" width={62} height={62} className="h-[62px] w-[62px] object-contain" />

          </div>

          <div className="min-w-0">

            <p className="text-[10px] font-extrabold uppercase tracking-[.23em] text-[#008448]">EMALAHLENI</p>

            <p className="text-[14px] font-extrabold leading-5">Local Municipality</p>

            <p className="mt-2 truncate text-[8px] font-semibold uppercase tracking-wider text-slate-400">SERVING OUR COMMUNITY</p>

          </div>

        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">

          <div className="mb-3 flex items-center justify-between px-3">

            <span className="text-[9px] font-extrabold uppercase tracking-[.19em] text-[#ffe082]">MAIN MENU</span>

            <span className="text-[9px] text-white/50">01</span>

          </div>

          <div className="space-y-1">

            {[

              { label: "Dashboard", href: "/dashboard", icon: "dashboard" },

              { label: "Complaints", href: "/complaints", icon: "complaints" },

              { label: "Departments", href: "/departments", icon: "departments" },

              { label: "Reports", href: "/reports", icon: "reports" },

            ].map((item) => <UsersSidebarItem key={item.href} {...item} active={false} />)}

          </div>

          <div className="mb-3 mt-7 flex items-center justify-between px-3">

            <span className="text-[9px] font-extrabold uppercase tracking-[.19em] text-[#ffe082]">USER MANAGEMENT</span>

            <span className="text-[9px] text-white/50">02</span>

          </div>

          <div className="space-y-1">

            <UsersSidebarItem label="Users & Roles" href="/users" icon="users" active />

            <UsersSidebarItem label="Staff" href="/staff" icon="staff" active={false} />

            <UsersSidebarItem label="Settings" href="/settings" icon="settings" active={false} />

          </div>

        </nav>

      </aside>



      <main className="min-h-screen lg:ml-[264px]">

        <header className="sticky top-0 z-20 flex min-h-[78px] items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-7">

          <div>

            <p className="text-[10px] font-bold uppercase tracking-[.15em] text-emerald-700">

              Complaints Management System

            </p>

            <h1 className="mt-1 text-lg font-bold text-gray-900">

              Users &amp; Roles

            </h1>

          </div>



          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">

            Staff administration

          </div>

        </header>



        <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-7">

          <div className="flex justify-end">

            <button

              onClick={openAdd}

              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"

            >

              <span className="text-lg">+</span>

              Add User

            </button>

          </div>



          {(notice || error) && (

            <div

              role="status"

              className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${

                error

                  ? "border-red-200 bg-red-50 text-red-800"

                  : "border-emerald-200 bg-emerald-50 text-emerald-800"

              }`}

            >

              <span>{error || notice}</span>

              <button

                onClick={() => {

                  setError("");

                  setNotice("");

                }}

                aria-label="Dismiss"

                className="font-bold"

              >

                ×

              </button>

            </div>

          )}



          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

            <Stat

              label="Total Staff Accounts"

              value={users.length}

              icon="♙"

            />

            <Stat

              label="Active Accounts"

              value={activeCount}

              icon="✓"

            />

            <Stat

              label="Inactive Accounts"

              value={users.length - activeCount}

              icon="◷"

            />

          </div>



          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

            <div className="border-b border-gray-100 p-5">

              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">

                <div>

                  <h3 className="text-sm font-bold text-gray-900">

                    Registered Staff

                  </h3>

                  <p className="mt-1 text-xs text-gray-500">

                    These records are loaded from Supabase, not browser

                    storage.

                  </p>

                </div>



                <button

                  onClick={() => void loadData()}

                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-50"

                >

                  Refresh list

                </button>

              </div>



              <input

                value={search}

                onChange={(e) => setSearch(e.target.value)}

                placeholder="Search name, username, email, contact number or section…"

                className={`${inputClass} mt-4`}

              />

            </div>



            {loading ? (

              <div className="p-12 text-center text-sm text-gray-500">

                Loading staff accounts…

              </div>

            ) : filteredUsers.length === 0 ? (

              <div className="p-12 text-center">

                <p className="text-sm font-semibold text-gray-800">

                  No staff accounts found

                </p>

                <p className="mt-2 text-xs text-gray-500">

                  Add a staff account or change your search.

                </p>

              </div>

            ) : (

              <div className="overflow-x-auto">

                <table className="w-full min-w-[900px] text-left">

                  <thead className="bg-gray-50">

                    <tr>

                      {[

                        "Staff Member",

                        "Role",

                        "Department / Section",

                        "Permissions",

                        "Status",

                        "Actions",

                      ].map((h) => (

                        <th

                          key={h}

                          className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500"

                        >

                          {h}

                        </th>

                      ))}

                    </tr>

                  </thead>



                  <tbody className="divide-y divide-gray-100">

                    {filteredUsers.map((user) => (

                      <tr

                        key={user.id}

                        className="hover:bg-emerald-50/30"

                      >

                        <td className="px-5 py-4">

                          <p className="text-xs font-semibold text-gray-900">

                            {user.full_name}

                          </p>

                          <p className="mt-1 text-[11px] text-gray-500">

                            {user.email || "No email"}

                          </p>

                          <p className="mt-1 text-[11px] text-gray-500">

                            {user.phone || "No contact number"}

                          </p>

                          <p className="mt-1 text-[10px] text-gray-400">

                            @{user.username || "no-username"}

                          </p>

                        </td>



                        <td className="px-5 py-4 text-xs">

                          {user.access_level || "Official"}

                        </td>



                        <td className="px-5 py-4">

                          <p className="text-xs">

                            {user.department_name}

                          </p>

                          <p className="mt-1 text-[11px] text-gray-500">

                            {user.section_name}

                          </p>

                        </td>



                        <td className="px-5 py-4">

                          <p className="text-xs font-semibold">

                            {user.pages.length} pages

                          </p>

                          <p className="mt-1 text-[11px] text-gray-500">

                            {user.actions.length} actions

                          </p>

                        </td>



                        <td className="px-5 py-4">

                          <span

                            className={`text-xs font-semibold ${

                              user.is_active === false

                                ? "text-gray-400"

                                : "text-emerald-700"

                            }`}

                          >

                            {user.is_active === false

                              ? "Inactive"

                              : "Active"}

                          </span>

                        </td>



                        <td className="px-5 py-4">

                          <div className="flex items-center gap-3">

                            <button

                              onClick={() => openEdit(user)}

                              className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"

                            >

                              Edit

                            </button>



                            <button

                              onClick={() => void changeStatus(user)}

                              className="text-xs font-semibold text-amber-700"

                            >

                              {user.is_active === false

                                ? "Activate"

                                : "Deactivate"}

                            </button>

                          </div>

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            )}



            <div className="border-t border-gray-100 px-5 py-3 text-[11px] text-gray-500">

              Showing {filteredUsers.length} of {users.length} staff accounts

            </div>

          </section>



          <section className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">

            <p className="text-xs font-bold text-emerald-900">

              Account security

            </p>

            <p className="mt-1 text-xs leading-5 text-emerald-800">

              Passwords are created through Supabase Authentication and are

              never saved in the staff profile table. Keep the service-role

              key on the server only.

            </p>

          </section>

        </div>

      </main>



      {showForm && (

        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-950/50 p-3 sm:p-6">

          <div

            role="dialog"

            aria-modal="true"

            aria-labelledby="user-form-title"

            className="my-auto w-full max-w-3xl overflow-visible rounded-xl bg-white shadow-2xl"

          >

            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">

              <div>

                <h2

                  id="user-form-title"

                  className="text-base font-bold text-gray-900"

                >

                  {editing ? "Edit Staff Account" : "Create Staff Account"}

                </h2>

                <p className="mt-1 text-xs text-gray-500">

                  Account details, department assignment and access rights.

                </p>

              </div>



              <button

                onClick={() => setShowForm(false)}

                className="px-2 text-xl text-gray-400"

                aria-label="Close"

              >

                ×

              </button>

            </div>



            <div className="flex gap-1 border-b border-gray-100 px-5 pt-3">

              {[

                {

                  id: "details",

                  label: "1. Account, Role & Assignment",

                },

                {

                  id: "permissions",

                  label: "2. Permissions",

                },

              ].map((t) => (

                <button

                  key={t.id}

                  type="button"

                  onClick={() =>

                    setTab(t.id as "details" | "permissions")

                  }

                  className={`border-b-2 px-3 py-3 text-xs font-semibold ${

                    tab === t.id

                      ? "border-emerald-700 text-emerald-800"

                      : "border-transparent text-gray-500"

                  }`}

                >

                  {t.label}

                </button>

              ))}

            </div>



            <form onSubmit={saveUser}>

              <div className="max-h-[65vh] space-y-5 overflow-y-auto p-5 sm:p-6">

                {tab === "details" ? (

                  <>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

                      <Field label="First name \*">

                        <input

                          required

                          value={form.first_name}

                          onChange={(e) =>

                            setField("first_name", e.target.value)

                          }

                          className={inputClass}

                          placeholder="First name"

                        />

                      </Field>



                      <Field label="Surname \*">

                        <input

                          required

                          value={form.surname}

                          onChange={(e) =>

                            setField("surname", e.target.value)

                          }

                          className={inputClass}

                          placeholder="Surname"

                        />

                      </Field>



                      <Field label="Email address (optional)">

                        <input

                          type="email"

                          value={form.email}

                          onChange={(e) =>

                            setField("email", e.target.value)

                          }

                          className={inputClass}

                          placeholder="name\@municipality.gov.za"

                        />

                      </Field>



                      <Field label="Contact number *">

                        <input

                          required

                          type="tel"

                          inputMode="numeric"

                          autoComplete="tel"

                          maxLength={10}

                          pattern="[0-9]{10}"

                          value={form.phone}

                          onChange={(e) =>

                            setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))

                          }

                          className={inputClass}

                          placeholder="10-digit contact number"

                        />

                      </Field>



                      <Field label="Username \*">

                        <input

                          required

                          value={form.username}

                          onChange={(e) =>

                            setField("username", e.target.value)

                          }

                          className={inputClass}

                          autoComplete="off"

                          placeholder="Username for sign in"

                        />

                      </Field>



                      <Field

                        label={

                          editing

                            ? "New password (optional)"

                            : "Temporary password \*"

                        }

                      >

                        <input

                          required={!editing}

                          minLength={8}

                          type="password"

                          value={form.password}

                          onChange={(e) =>

                            setField("password", e.target.value)

                          }

                          className={inputClass}

                          autoComplete="new-password"

                          placeholder={

                            editing

                              ? "Leave blank to keep current password"

                              : "At least 8 characters"

                          }

                        />

                      </Field>



                      <Field label="Job title">

                        <input

                          value={form.job_title}

                          onChange={(e) =>

                            setField("job_title", e.target.value)

                          }

                          className={inputClass}

                          placeholder="e.g. Call Centre Agent"

                        />

                      </Field>



                      <Field label="Account status">

                        <select

                          value={form.is_active ? "active" : "inactive"}

                          onChange={(e) =>

                            setField(

                              "is_active",

                              e.target.value === "active"

                            )

                          }

                          className={inputClass}

                        >

                          <option value="active">Active</option>

                          <option value="inactive">Inactive</option>

                        </select>

                      </Field>



                      <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">

                          <div>

                            <h3 className="text-sm font-bold text-gray-900">

                              User Role

                            </h3>

                            <p className="mt-1 text-xs leading-5 text-gray-600">

                              Choose the staff member&apos;s system role.

                              The role sets default page access and actions;

                              you can customise them in the Permissions tab.

                            </p>

                          </div>



                          <span className="inline-flex w-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">

                            {form.access_level}

                          </span>

                        </div>



                        <div className="mt-3">

                          <select

                            aria-label="User role"

                            value={form.access_level}

                            onChange={(e) =>

                              setRole(e.target.value as Role)

                            }

                            className={inputClass}

                          >

                            {roles.map((r) => (

                              <option key={r} value={r}>

                                {r}

                              </option>

                            ))}

                          </select>

                        </div>



                        <p className="mt-2 text-xs text-gray-600">

                          {(

                            {

                              Administrator:

                                "Full access to user administration, system pages and permissions.",

                              "Call Centre Agent":

                                "Captures complaints and updates initial complaint information.",

                              Supervisor:

                                "Monitors complaint progress, assigns work and reviews reports.",

                              Clerk:

                                "Has the same complaint, assignment, escalation and reporting access as a Supervisor.",

                              Official:

                                "Works on complaints assigned to their department or section.",

                              "Department Manager":

                                "Oversees departmental complaints, assignments and reports.",

                              "Assistant Manager":
                                "Views the dashboard and reports for their own department.",

                              Director:
                                "Views the dashboard and reports for their own department.",

                              "Municipal Manager":
                                "Views the municipality-wide dashboard, reports and departments.",

                              Communications:
                                "Views the municipality-wide dashboard across all departments.",

                            } as Record<Role, string>

                          )[form.access_level]}

                        </p>

                      </div>



                      {!["Call Centre Agent", "Municipal Manager", "Communications", "Administrator"].includes(form.access_level) && <Field label="Department / Directorate">
                        <select
                          value={showOtherDepartment ? "__other__" : form.department_id}
                          onChange={(e) => {
                            const departmentId = e.target.value;
                            if (departmentId === "__other__") {
                              setShowOtherDepartment(true);
                              setShowOtherSection(false);
                              setField("department_id", "");
                              setField("section_id", "");
                              setDepartmentSections([]);
                              return;
                            }
                            setShowOtherDepartment(false);
                            setField("department_id", departmentId);
                            setField("section_id", "");
                            void loadDepartmentSections(departmentId);
                          }}
                          className={inputClass}
                        >
                          <option value="">
                            {["Call Centre Agent", "Municipal Manager", "Communications"].includes(form.access_level)
                              ? "No department restriction"
                              : "Select department"}
                          </option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                          <option value="__other__">Other — add a department</option>
                        </select>
                        {showOtherDepartment && (
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                            <input
                              value={otherDepartmentName}
                              onChange={(e) => setOtherDepartmentName(e.target.value)}
                              className={inputClass}
                              placeholder="Enter new department name"
                            />
                            <button
                              type="button"
                              disabled={!otherDepartmentName.trim()}
                              onClick={async () => {
                                setError("");
                                const name = otherDepartmentName.trim();
                                const existing = departments.find((d) => normalizeName(d.name) === normalizeName(name));
                                if (existing) {
                                  setField("department_id", existing.id);
                                  setShowOtherDepartment(false);
                                  setOtherDepartmentName("");
                                  void loadDepartmentSections(existing.id);
                                  return;
                                }
                                const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
                                if (sessionError || !sessionData.session?.access_token) {
                                  setError("Your session could not be verified. Sign in again.");
                                  return;
                                }
                                const response = await fetch("/api/admin/catalog", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${sessionData.session.access_token}`,
                                  },
                                  body: JSON.stringify({ type: "department", name }),
                                });
                                const result = await response.json();
                                if (!response.ok || !result.department) {
                                  setError(`Could not add department: ${result.error ?? "No record returned"}`);
                                  return;
                                }
                                const data = result.department as Department;
                                setDepartments((prev) => [...prev, data as Department].sort((a, b) => isTechnicalServices(a.name) ? -1 : isTechnicalServices(b.name) ? 1 : a.name.localeCompare(b.name)));
                                setField("department_id", data.id);
                                setField("section_id", "");
                                setShowOtherDepartment(false);
                                setOtherDepartmentName("");
                                void loadDepartmentSections(data.id);
                                setNotice("Department added successfully.");
                              }}
                              className="shrink-0 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                            >Add department</button>
                          </div>
                        )}
                      </Field>}

                      {!["Call Centre Agent", "Municipal Manager", "Communications", "Administrator"].includes(form.access_level) && <Field label={`Section${["Department Manager", "Assistant Manager", "Director", "Municipal Manager", "Communications"].includes(form.access_level) ? " (optional)" : ""}`}>
                        <select
                          value={showOtherSection ? "__other__" : form.section_id}
                          disabled={!form.department_id}
                          onChange={(e) => {
                            if (e.target.value === "__other__") {
                              setShowOtherSection(true);
                              setField("section_id", "");
                            } else {
                              setShowOtherSection(false);
                              setField("section_id", e.target.value);
                            }
                          }}
                          className={inputClass}
                        >
                          <option value="">
                            {!form.department_id ? "Select department first" : sectionsLoading ? "Loading sections…" : "Select section (or leave unassigned if optional)"}
                          </option>
                          {selectedSections.map((section) => (
                            <option key={section.id} value={section.id}>
                              {selectedDepartment && isTechnicalServices(selectedDepartment.name) ? technicalSectionLabel(section.name) : section.name}
                            </option>
                          ))}
                          <option value="__other__">Other — add a section</option>
                        </select>
                        {showOtherSection && form.department_id && (
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                            <input
                              value={otherSectionName}
                              onChange={(e) => setOtherSectionName(e.target.value)}
                              className={inputClass}
                              placeholder="Enter new section name"
                            />
                            <button
                              type="button"
                              disabled={!otherSectionName.trim()}
                              onClick={async () => {
                                setError("");
                                const name = otherSectionName.trim();
                                const existing = departmentSections.find((section) => normalizeName(section.name) === normalizeName(name));
                                if (existing) {
                                  setField("section_id", existing.id);
                                  setShowOtherSection(false);
                                  setOtherSectionName("");
                                  return;
                                }
                                const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
                                if (sessionError || !sessionData.session?.access_token) {
                                  setError("Your session could not be verified. Sign in again.");
                                  return;
                                }
                                const response = await fetch("/api/admin/catalog", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${sessionData.session.access_token}`,
                                  },
                                  body: JSON.stringify({
                                    type: "section",
                                    name,
                                    department_id: form.department_id,
                                  }),
                                });
                                const result = await response.json();
                                if (!response.ok || !result.section) {
                                  setError(`Could not add section: ${result.error ?? "No record returned"}`);
                                  return;
                                }
                                const data = result.section as Section;
                                setDepartmentSections((prev) => [...prev, data as Section].sort((a, b) => a.name.localeCompare(b.name)));
                                setSections((prev) => [...prev, data as Section]);
                                setField("section_id", data.id);
                                setShowOtherSection(false);
                                setOtherSectionName("");
                                setNotice("Section added successfully.");
                              }}
                              className="shrink-0 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                            >Add section</button>
                          </div>
                        )}
                      </Field>}


                    </div>

                  </>

                ) : (

                  <>

                    <div>

                      <h3 className="text-sm font-bold text-gray-900">

                        Page access

                      </h3>

                      <p className="mt-1 text-xs text-gray-500">

                        Choose which application pages the staff member can

                        access.

                      </p>

                    </div>



                    <div className="overflow-hidden rounded-lg border border-gray-200">

                      {pagePermissions.map((p, i) => (

                        <label

                          key={p.page}

                          className={`flex cursor-pointer items-start gap-3 p-3.5 hover:bg-emerald-50/50 ${

                            i ? "border-t border-gray-100" : ""

                          }`}

                        >

                          <input

                            type="checkbox"

                            checked={form.pages.includes(p.page)}

                            onChange={() => toggleList("pages", p.page)}

                            className="mt-1 h-4 w-4 accent-emerald-700"

                          />



                          <span className="flex-1">

                            <span className="block text-xs font-semibold text-gray-800">

                              {p.page}

                            </span>

                            <span className="mt-1 block text-[11px] text-gray-500">

                              {p.description}

                            </span>

                            <span className="mt-1 block text-[10px] text-gray-400">

                              {p.path}

                            </span>

                          </span>



                          <span className="text-[10px] text-gray-400">

                            {form.pages.includes(p.page)

                              ? "Allowed"

                              : "Denied"}

                          </span>

                        </label>

                      ))}

                    </div>



                    <div>

                      <h3 className="text-sm font-bold text-gray-900">

                        Complaint and report actions

                      </h3>



                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">

                        {actions.map((a) => (

                          <label

                            key={a.id}

                            className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50"

                          >

                            <input

                              type="checkbox"

                              checked={form.actions.includes(a.id)}

                              onChange={() =>

                                toggleList("actions", a.id)

                              }

                              className="h-4 w-4 accent-emerald-700"

                            />



                            <span className="text-xs font-medium text-gray-700">

                              {a.label}

                            </span>

                          </label>

                        ))}

                      </div>

                    </div>



                    <div className="flex flex-wrap gap-4 border-t border-gray-100 pt-4">

                      <button

                        type="button"

                        onClick={() =>

                          setForm((p) => ({

                            ...p,

                            pages: pagePermissions.map((x) => x.page),

                          }))

                        }

                        className="text-xs font-semibold text-emerald-700"

                      >

                        Select all pages

                      </button>



                      <button

                        type="button"

                        onClick={() =>

                          setForm((p) => ({ ...p, pages: [] }))

                        }

                        className="text-xs font-semibold text-gray-500"

                      >

                        Clear pages

                      </button>



                      <button

                        type="button"

                        onClick={() =>

                          setForm((p) => ({

                            ...p,

                            ...roleDefaults[p.access_level],

                          }))

                        }

                        className="text-xs font-semibold text-gray-500"

                      >

                        Reset to role defaults

                      </button>

                    </div>

                  </>

                )}



                {error && (

                  <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">

                    {error}

                  </p>

                )}

              </div>



              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">

                <button

                  type="button"

                  onClick={() =>

                    setTab(

                      tab === "details" ? "permissions" : "details"

                    )

                  }

                  className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold"

                >

                  {tab === "details"

                    ? "Next: Permissions →"

                    : "← Back to Details"}

                </button>



                <div className="flex gap-2">

                  <button

                    type="button"

                    onClick={() => setShowForm(false)}

                    className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold"

                  >

                    Cancel

                  </button>



                  <button

                    disabled={saving}

                    type="submit"

                    className="rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"

                  >

                    {saving

                      ? editing

                        ? "Updating user…"

                        : "Creating user…"

                      : editing

                        ? "Save Changes"

                        : "Create User"}

                  </button>

                </div>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>

  );

}



function Field({

  label,

  children,

}: {

  label: string;

  children: ReactNode;

}) {

  return (

    <label className="block">

      <span className="mb-1.5 block text-xs font-semibold text-gray-700">

        {label}

      </span>

      {children}

    </label>

  );

}



function Stat({

  label,

  value,

  icon,

}: {

  label: string;

  value: number;

  icon: string;

}) {

  return (

    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">

      <div className="flex items-center justify-between">

        <p className="text-xs font-medium text-gray-500">{label}</p>

        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-lg font-bold text-emerald-700">

          {icon}

        </span>

      </div>



      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>

    </div>

  );

}

function UsersSidebarItem({ label, href, icon, active }: { label: string; href: string; icon: string; active: boolean }) {

  const paths: Record<string, ReactNode> = {

    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,

    complaints: <><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5Z"/><path d="M8 10h9M8 14h6"/></>,

    departments: <><rect x="4" y="3" width="7" height="18" rx="1"/><rect x="13" y="3" width="7" height="18" rx="1"/></>,

    reports: <><path d="M5 21V4h14v17M5 8h14M9 12h6M9 16h6"/></>,

    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,

    staff: <><circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2H5"/></>,

    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.9 1.9-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.57V21h-2.7v-.09a1.7 1.7 0 0 0-1-1.57 1.7 1.7 0 0 0-1.88.34l-.06.06-1.9-1.9.06-.06A1.7 1.7 0 0 0 7.8 15a1.7 1.7 0 0 0-1.57-1H6v-2.7h.23a1.7 1.7 0 0 0 1.57-1 1.7 1.7 0 0 0-.34-1.88L7.4 8.36l1.9-1.9.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1-1.57V5h2.7v.29a1.7 1.7 0 0 0 1 1.57 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.9 1.9-.06.06A1.7 1.7 0 0 0 19.4 10.3a1.7 1.7 0 0 0 1.57 1H21V14h-.03A1.7 1.7 0 0 0 19.4 15Z"/></>,

  };

  return (

    <Link href={href} aria-current={active ? "page" : undefined} className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all duration-200 ${active ? "bg-white/10 text-white shadow-sm shadow-black/10" : "text-white/85 hover:bg-white/10 hover:text-white"}`}>

      {active && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r bg-[#ffe082]" />}

      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-white/15 text-[#ffe082]" : "bg-white/10 text-white/80 group-hover:bg-white/15"}`}>

        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[icon]}</svg>

      </span>

      <span className="flex-1 text-[11px] font-bold">{label}</span>

      {active && <span className="text-[14px] text-white/85">→</span>}

    </Link>

  );

}
