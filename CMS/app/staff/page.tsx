"use client";



import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";



import Image from "next/image";



import Link from "next/link";



import { useRouter } from "next/navigation";



import { createClient } from "@/lib/supabase/client";



type Department = { id: string; name: string };



type Section = { id: string; name: string; department_id: string };



type Profile = {



  id: string;



  full_name: string | null;



  access_level: string | null;



  department_id: string | null;



  section_id: string | null;



};



type StaffMember = {



  id: string;



  full_name: string;



  email: string | null;



  employee_number: string | null;



  designation: string;



  department_id: string | null;



  section_id: string | null;



  contact_number: string;



  is_active: boolean;



  standby_available: boolean;



  duty_type: string | null;



  shift_type: string | null;



};



type StaffForm = {



  full_name: string;



  email: string;



  employee_number: string;



  designation: string;



  department_id: string;



  section_id: string;



  contact_number: string;



  is_active: boolean;



  standby_available: boolean;



  duty_type: string;



  shift_type: string;



};



const supabase = createClient();



const inputClass =



  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";



const emptyForm = (): StaffForm => ({



  full_name: "",



  email: "",



  employee_number: "",



  designation: "",



  department_id: "",



  section_id: "",



  contact_number: "",



  is_active: true,



  standby_available: false,



  duty_type: "day_shift",



  shift_type: "",



});



function isAdmin(role: string) {



  const value = role.toLowerCase();



  return value === "admin" || value.includes("administrator");



}



function isSupervisor(role: string) {



  const value = role.toLowerCase();



  return value.includes("supervisor") || value.includes("department manager");



}



function isClerk(role: string) {
  const value = role.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return value === "clerk" || value === "municipal clerk";
}


function isCallCentreAgent(role: string) {



  const value = role.toLowerCase().replace(/[**\\\_**-]+/g, " ").replace(/\s+/g, " ").trim();



  return ["call centre agent", "call center agent", "call centre", "call center"].includes(value);



}



function isCallCentreDisasterSection(sectionName: string) {



  return /call\s*cent(re|er)|disaster\s*management/i.test(sectionName);



}



export default function StaffPage() {



  const router = useRouter();



  const [profile, setProfile] = useState<Profile | null>(null);



  const [staff, setStaff] = useState<StaffMember[]>([]);



  const [departments, setDepartments] = useState<Department[]>([]);



  const [sections, setSections] = useState<Section[]>([]);



  const [formSections, setFormSections] = useState<Section[]>([]);



  const [form, setForm] = useState<StaffForm>(emptyForm());



  const [editingId, setEditingId] = useState<string | null>(null);



  const [showForm, setShowForm] = useState(false);



  const [loading, setLoading] = useState(true);



  const [saving, setSaving] = useState(false);



  const [search, setSearch] = useState("");



  const [departmentFilter, setDepartmentFilter] = useState("");



  const [sectionFilter, setSectionFilter] = useState("");



  const [collapsedDepartments, setCollapsedDepartments] = useState<string[]>([]);



  const [notice, setNotice] = useState("");



  const [error, setError] = useState("");



  const admin = isAdmin(profile?.access_level ?? "");



  const supervisor = isSupervisor(profile?.access_level ?? "");



  const callCentreAgent = isCallCentreAgent(profile?.access_level ?? "");



  const clerk = isClerk(profile?.access_level ?? "");



  const canManageStaff = admin || supervisor;



  const canAddStaff = canManageStaff || clerk;



  const permitted = canAddStaff || callCentreAgent;



  const loadData = useCallback(async () => {



    setLoading(true);



    setError("");



    try {



      const {



        data: { user },



        error: authError,



      } = await supabase.auth.getUser();



      if (authError || !user) {



        throw new Error("Your session could not be verified. Please sign in again.");



      }



      const { data: profileRow, error: profileError } = await supabase



        .from("profiles")



        .select("id,full_name,access_level,department_id,section_id")



        .eq("id", user.id)



        .single();



      if (profileError || !profileRow) {



        throw new Error(profileError?.message ?? "Your user profile could not be found.");



      }



      const currentProfile = profileRow as Profile;



      setProfile(currentProfile);



      const roleIsAdmin = isAdmin(currentProfile.access_level ?? "");



      const roleIsSupervisor = isSupervisor(currentProfile.access_level ?? "");



      const roleIsCallCentreAgent = isCallCentreAgent(currentProfile.access_level ?? "");



      const roleIsClerk = isClerk(currentProfile.access_level ?? "");



      if (!roleIsAdmin && !roleIsSupervisor && !roleIsCallCentreAgent && !roleIsClerk) {



        setStaff([]);



        setDepartments([]);



        setSections([]);



        throw new Error("You do not have permission to access the Staff Directory.");



      }



      if ((roleIsSupervisor || roleIsClerk) && (!currentProfile.department_id || !currentProfile.section_id)) {
        setStaff([]);
        throw new Error(
          roleIsClerk
            ? "Your Clerk account does not have a department and section assigned. Ask an Administrator to assign both in User Management before adding staff."
            : "Your Supervisor account does not have a department and section assigned. Ask an Administrator to update your profile."
        );
      }



      const [staffResult, departmentResult, sectionResult] = await Promise.all([



        supabase



          .from("staff_directory")



          .select("id,full_name,email,employee_number,designation,department_id,section_id,contact_number,is_active,standby_available,duty_type,shift_type")



          .order("full_name", { ascending: true }),



        supabase.from("departments").select("id,name").order("name"),



        supabase.from("sections").select("id,name,department_id").order("name"),



      ]);



      const queryError =



        staffResult.error || departmentResult.error || sectionResult.error;



      if (queryError) throw queryError;



      let staffRows = (staffResult.data ?? []) as StaffMember[];

      // Khulekani Mthimunye is a Supervisor account, not operational personnel.
      // Keep his account and role in `profiles`; do not show him as a staff-directory member.
      const isKhulekaniSupervisor = (name: string) =>
        name.trim().toLowerCase().replace(/\s+/g, " ") === "khulekani mthimunye";
      staffRows = staffRows.filter((person) => !isKhulekaniSupervisor(person.full_name));



      let departmentRows = (departmentResult.data ?? []) as Department[];



      // Keep Technical Services first, then retain alphabetical order for the rest.



      departmentRows = [...departmentRows].sort((a, b) => {



        const aIsTechnical = a.name.trim().toLowerCase() === "technical services";



        const bIsTechnical = b.name.trim().toLowerCase() === "technical services";



        if (aIsTechnical && !bIsTechnical) return -1;



        if (!aIsTechnical && bIsTechnical) return 1;



        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });



      });



      let sectionRows = (sectionResult.data ?? []) as Section[];



      // Enforce the supervisor's section in the page as well as in database RLS.



      if (roleIsSupervisor || roleIsClerk) {
        staffRows = staffRows.filter((person) => person.section_id === currentProfile.section_id);
        departmentRows = departmentRows.filter((department) => department.id === currentProfile.department_id);
        sectionRows = sectionRows.filter((section) => section.id === currentProfile.section_id);
      }



      setStaff(staffRows);



      setDepartments(departmentRows);



      setSections(sectionRows);



      setFormSections(sectionRows);



    } catch (err) {



      setError(err instanceof Error ? err.message : "Unable to load the Staff Directory.");



    } finally {



      setLoading(false);



    }



  }, []);



  useEffect(() => {



    void loadData();



  }, [loadData]);



  const filteredStaff = useMemo(() => {



    const term = search.trim().toLowerCase();



    return staff.filter((person) => {



      const departmentName =



        departments.find((item) => item.id === person.department_id)?.name ?? "";



      const sectionName =



        sections.find((item) => item.id === person.section_id)?.name ?? "";



      const matchesSearch =



        !term ||



        [



          person.full_name,



          person.email ?? "",



          person.employee_number ?? "",



          person.designation,



          person.contact_number,



          departmentName,



          sectionName,



        ].some((value) => value.toLowerCase().includes(term));



      return (



        matchesSearch &&



        (!departmentFilter || person.department_id === departmentFilter) &&



        (!sectionFilter || person.section_id === sectionFilter)



      );



    });



  }, [staff, departments, sections, search, departmentFilter, sectionFilter]);



  const activeCount = staff.filter((person) => person.is_active).length;



  const inactiveCount = staff.length - activeCount;



  const getDutyType = (person: StaffMember) => person.duty_type || (person.standby_available ? "standby" : "day_shift");



  const standbyTeam = staff.filter((person) => person.is_active && getDutyType(person) === "standby");



  const dayTeam = staff.filter((person) => person.is_active && getDutyType(person) === "day_shift");



  const overtimeTeam = staff.filter((person) => person.is_active && getDutyType(person) === "overtime");



  const firstCallCentreShift = staff.filter((person) => person.is_active && person.shift_type === "06:00-14:00");



  const secondCallCentreShift = staff.filter((person) => person.is_active && person.shift_type === "14:00-22:00");



  const departmentGroups = useMemo(() => {



    return departments



      .filter((department) => !departmentFilter || department.id === departmentFilter)



      .map((department) => ({



        ...department,



        sections: sections



          .filter((section) => section.department_id === department.id && (!sectionFilter || section.id === sectionFilter))



          .map((section) => ({



            ...section,



            people: filteredStaff.filter((person) => person.section_id === section.id),



          })),



      }));



  }, [departments, sections, filteredStaff, departmentFilter, sectionFilter]);



  function toggleDepartment(departmentId: string) {



    setCollapsedDepartments((current) =>



      current.includes(departmentId)



        ? current.filter((id) => id !== departmentId)



        : [...current, departmentId]



    );



  }



  function updateField<K extends keyof StaffForm>(key: K, value: StaffForm[K]) {



    setForm((current) => ({ ...current, [key]: value }));



  }



  function openAdd() {



    setEditingId(null);



    setForm({



      ...emptyForm(),



      ...((supervisor || clerk)
        ? {
            department_id: profile?.department_id ?? "",
            section_id: profile?.section_id ?? "",
          }
        : {}),



    });



    setFormSections(sections);



    setError("");



    setNotice("");



    setShowForm(true);



  }



  function openAddForSection(section: Section) {



    setEditingId(null);



    setForm({



      ...emptyForm(),



      department_id: section.department_id,



      section_id: section.id,



    });



    setFormSections(sections.filter((item) => item.department_id === section.department_id));



    setError("");



    setNotice("");



    setShowForm(true);



  }



  function openEdit(person: StaffMember) {



    setEditingId(person.id);



    setForm({



      full_name: person.full_name,



      email: person.email ?? "",



      employee_number: person.employee_number ?? "",



      designation: person.designation,



      department_id: person.department_id ?? "",



      section_id: person.section_id ?? "",



      contact_number: person.contact_number,



      is_active: person.is_active,



      standby_available: person.standby_available,



      duty_type: person.duty_type || (person.standby_available ? "standby" : "day_shift"),



      shift_type: person.shift_type ?? "",



    });



    setFormSections(



      sections.filter((section) => section.department_id === person.department_id)



    );



    setError("");



    setNotice("");



    setShowForm(true);



  }



  async function changeDepartment(departmentId: string) {



    updateField("department_id", departmentId);



    updateField("section_id", "");



    if (!departmentId) {



      setFormSections([]);



      return;



    }



    const { data, error: sectionError } = await supabase



      .from("sections")



      .select("id,name,department_id")



      .eq("department_id", departmentId)



      .order("name");



    if (sectionError) {



      setError(`Could not load sections: ${sectionError.message}`);



      setFormSections([]);



      return;



    }



    let rows = (data ?? []) as Section[];



    if (supervisor) {



      rows = rows.filter((section) => section.id === profile?.section_id);



    }



    setFormSections(rows);



  }



  async function saveStaff(event: FormEvent<HTMLFormElement>) {



    event.preventDefault();



    setError("");



    setNotice("");



    if (



      !form.full_name.trim() ||



      !form.email.trim() ||



      !form.designation.trim() ||



      !form.department_id ||



      !form.section_id ||



      !form.contact_number.trim()



    ) {



      setError("Complete the name, email address, designation, department, section and contact number.");



      return;



    }



    const email = form.email.trim().toLowerCase();



    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;



    if (!emailPattern.test(email)) {



      setError("Enter a valid email address for this staff member.");



      return;



    }



    const digits = form.contact_number.replace(/\D/g, "");



    if (digits.length !== 10) {



      setError("Enter a valid 10-digit contact number.");



      return;



    }



    if (
      (supervisor || clerk) &&
      (form.department_id !== profile?.department_id || form.section_id !== profile?.section_id)
    ) {
      setError("You can only add personnel in your own assigned department and section.");



      return;



    }



    const selectedSectionName = sections.find((section) => section.id === form.section_id)?.name ?? formSections.find((section) => section.id === form.section_id)?.name ?? "";



    const shiftSection = isCallCentreDisasterSection(selectedSectionName);



    if (shiftSection && !["06:00-14:00", "14:00-22:00"].includes(form.shift_type)) {



      setError("Select the staff member shift for Call Centre / Disaster Management.");



      return;



    }



    if (



      !formSections.some(



        (section) =>



          section.id === form.section_id &&



          section.department_id === form.department_id



      )



    ) {



      setError("The selected section does not belong to the selected department.");



      return;



    }



    setSaving(true);



    try {



      const {



        data: { user },



        error: authError,



      } = await supabase.auth.getUser();



      if (authError || !user) throw new Error("Please sign in again.");



      const payload = {



        full_name: form.full_name.trim(),



        email,



        employee_number: form.employee_number.trim() || null,



        designation: form.designation.trim(),



        department_id: form.department_id,



        section_id: form.section_id,



        contact_number: digits,



        is_active: form.is_active,



        standby_available: form.duty_type === "standby",



        duty_type: form.duty_type,



        shift_type: shiftSection ? form.shift_type : null,



      };



      const result = editingId



        ? await supabase



            .from("staff_directory")



            .update(payload)



            .eq("id", editingId)



        : await supabase.from("staff_directory").insert({



            ...payload,



            created_by: user.id,



          });



      if (result.error) throw result.error;



      setShowForm(false);



      setNotice(editingId ? "Personnel record updated." : "Personnel added successfully.");



      await loadData();



    } catch (err: unknown) {
      // Supabase/PostgREST errors are plain objects, not always Error instances.
      // Surface the real database/RLS/constraint message instead of a generic alert.
      const dbError = (err && typeof err === "object" ? err : {}) as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };
      const errorMessage = [
        dbError.message,
        dbError.details,
        dbError.hint,
        dbError.code ? `Code: ${dbError.code}` : "",
      ].filter(Boolean).join(" — ");
      setError(
        errorMessage ||
          (err instanceof Error ? err.message : String(err) || "Unable to save the personnel record.")
      );
    } finally {



      setSaving(false);



    }



  }



  async function toggleStatus(person: StaffMember) {



    setError("");



    setNotice("");



    if (



      supervisor &&



      person.section_id !== profile?.section_id



    ) {



      setError("You can only change the status of personnel in your own section.");



      return;



    }



    const { error: updateError } = await supabase



      .from("staff_directory")



      .update({ is_active: !person.is_active, ...(person.is_active ? { standby_available: false, duty_type: "day_shift" } : {}) })



      .eq("id", person.id);



    if (updateError) {



      setError(updateError.message);



      return;



    }



    setNotice(



      `${person.full_name} has been ${person.is_active ? "deactivated" : "activated"}.`



    );



    await loadData();



  }



  if (!loading && !permitted) {



    return (



      <div className="flex min-h-screen items-center justify-center bg-[#f6f8f6] p-6">



        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">



          <h1 className="text-lg font-bold text-gray-900">Access restricted</h1>



          <p className="mt-2 text-sm text-gray-600">



            The Staff Directory is available to authorised municipal users only.



          </p>



          <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-emerald-700">



            Return to dashboard



          </Link>



        </div>



      </div>



    );



  }



  const visibleSections = supervisor



    ? sections.filter((section) => section.id === profile?.section_id)



    : sections.filter(



        (section) => !departmentFilter || section.department_id === departmentFilter



      );



  return (



    <div className="min-h-screen bg-[#f6f8f6] text-gray-800">



      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col bg-[#14532d] text-white lg:flex">



        <div className="flex min-h-[156px] w-full shrink-0 items-center border-b border-white/10 bg-gradient-to-br from-white via-[#f5fbf6] to-[#e8f5ec] px-3 py-5">
          <div className="flex w-full min-w-0 items-center gap-2.5">
            <div className="relative flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[20px] border-4 border-emerald-600 bg-white shadow-sm">
              <Image
                src="/Emalahleni%20Logo.png"
                alt="Emalahleni Local Municipality"
                width={54}
                height={54}
                className="h-[54px] w-[54px] object-contain"
                priority
              />
              <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white bg-yellow-400" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-extrabold leading-tight tracking-[.14em] text-emerald-700">
                EMALAHLENI
              </p>
              <p className="mt-1 whitespace-normal text-[13px] font-extrabold leading-[1.2] tracking-tight text-slate-900">
                Local Municipality
              </p>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="h-1 w-7 shrink-0 rounded-full bg-emerald-700" />
                <span className="h-1 w-3 shrink-0 rounded-full bg-yellow-400" />
                <span className="min-w-0 text-[8px] font-semibold uppercase leading-tight tracking-[.08em] text-slate-500">
                  Serving our community
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pb-2 pt-6">



          <div className="flex items-center justify-between px-3">



            <p className="text-[9px] font-extrabold uppercase tracking-[.2em] text-yellow-300">Main Menu</p>



            <span className="text-[9px] font-semibold text-white/45">01</span>



          </div>



        </div>



        <nav className="space-y-1 px-3">



          <NavLink href="/dashboard" label="Dashboard" icon="▦" />



          {(admin || callCentreAgent) && <NavLink href="/complaints" label="Complaints" icon="☷" />}



          {(admin || callCentreAgent) && <NavLink href="/departments" label="Departments" icon="◫" />}



          {(admin || supervisor || clerk || callCentreAgent) && <NavLink href="/reports" label="Reports" icon="⚑" />}



        </nav>



        <div className="px-4 pb-2 pt-7">



          <div className="flex items-center justify-between px-3">



            <p className="text-[9px] font-extrabold uppercase tracking-[.2em] text-yellow-300">User Management</p>



            <span className="text-[9px] font-semibold text-white/45">02</span>



          </div>



        </div>



        <nav className="flex-1 space-y-1 px-3">



          {admin && <NavLink href="/users" label="Users & Roles" icon="♙" />}



          <NavLink href="/staff" label="Staff" icon="♧" active />



          <NavLink href="/councillors" label="Councillors" icon="♙" />



          {admin && <NavLink href="/settings" label="Settings" icon="⚙" />}



        </nav>



      </aside>



      <main className="min-h-screen lg:ml-[258px]">



        <header className="sticky top-0 z-20 flex min-h-[78px] items-center justify-between gap-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-7">



          <div>



            <p className="text-[10px] font-bold uppercase tracking-[.15em] text-emerald-700">



              Complaints Management System



            </p>



            <h1 className="mt-1 text-lg font-bold text-gray-900">Staff Directory</h1>



          </div>



          <div className="flex items-center gap-3">



            <div className="hidden text-right sm:block">



              <p className="text-xs font-semibold text-gray-900">



                {profile?.full_name || "Logged-in user"}



              </p>



              <p className="mt-0.5 text-[10px] text-gray-500">



                {profile?.access_level || ""}



              </p>



            </div>



            <button



              type="button"



              onClick={async () => {



                setError("");



                const { error: signOutError } = await supabase.auth.signOut();



                if (signOutError) {



                  setError(`Unable to sign out: ${signOutError.message}`);



                  return;



                }



                router.replace("/login");



                router.refresh();



              }}



              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"



            >



              Sign out



            </button>



          </div>



        </header>



        <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-7">



          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">



            <div>



              <h2 className="text-xl font-bold text-gray-900">



                {admin || clerk || callCentreAgent ? "Municipal Staff Directory" : "My Section Personnel"}



              </h2>



              <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">



                {admin
                  ? "Add and manage municipal personnel across all departments and sections."
                  : clerk
                    ? "View the municipal staff directory and add new personnel across departments and sections. Existing staff records can only be edited by Administrators and Supervisors."
                    : callCentreAgent
                      ? "View all municipal departments and sections, with separate lists of teams available during the day and on standby for Call Centre support. This directory is read-only."
                      : "Add and manage personnel assigned to your section. You can only access staff records within your own section."}



              </p>



              {supervisor && (



                <p className="mt-2 text-xs font-semibold text-emerald-800">



                  {departments[0]?.name ?? "Department"} · {sections[0]?.name ?? "Assigned section"}



                </p>



              )}



            </div>



            {canAddStaff && (



              <button



                onClick={openAdd}



                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"



              >



                <span className="text-lg">+</span> Add Staff



              </button>



            )}



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



          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">



            <Stat label="Total Personnel" value={staff.length} icon="♧" />



            <Stat label="Active Personnel" value={activeCount} icon="✓" />



            <Stat label="Inactive Personnel" value={inactiveCount} icon="◷" />



            <Stat label="Standby Available" value={standbyTeam.length} icon="◉" />



            <Stat label="Overtime" value={overtimeTeam.length} icon="◷" />



          </div>



          {callCentreAgent && (



            <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">



              <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-4">



                <h3 className="text-sm font-bold text-emerald-950">Call Centre / Disaster Management Shift Roster</h3>



                <p className="mt-1 text-xs leading-5 text-emerald-800">Staff registered by the section supervisor are displayed here for Call Centre visibility.</p>



              </div>



              <div className="grid gap-4 p-4 lg:grid-cols-2">



                {[



                  { title: "Morning shift", hours: "06:00–14:00", people: firstCallCentreShift, tone: "emerald" },



                  { title: "Afternoon shift", hours: "14:00–22:00", people: secondCallCentreShift, tone: "amber" },



                ].map((shift) => (



                  <div key={shift.hours} className={`overflow-hidden rounded-lg border ${shift.tone === "emerald" ? "border-emerald-200" : "border-amber-200"}`}>



                    <div className={`flex items-center justify-between px-4 py-3 ${shift.tone === "emerald" ? "bg-emerald-100" : "bg-amber-100"}`}>



                      <div><h4 className="text-xs font-bold text-gray-900">{shift.title}</h4><p className="mt-1 text-[11px] text-gray-700">{shift.hours}</p></div>



                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-800">{shift.people.length}</span>



                    </div>



                    {shift.people.length === 0 ? <p className="p-4 text-xs text-gray-500">No active staff have been assigned to this shift yet.</p> : (



                      <div className="max-h-[320px] space-y-2 overflow-y-auto p-3">



                        {shift.people.map((person) => <div key={person.id} className="rounded-md border border-gray-100 bg-white px-3 py-2">



                          <p className="text-xs font-semibold text-gray-900">{person.full_name}</p>



                          <p className="mt-1 text-[11px] text-gray-600">{person.designation}</p>



                          <p className="mt-1 text-[11px] text-emerald-800">{departments.find((item) => item.id === person.department_id)?.name ?? "Department"} · {sections.find((item) => item.id === person.section_id)?.name ?? "Section"}</p>



                          <p className="mt-1 text-[11px] text-gray-500">{person.contact_number}</p>



                          <p className="mt-1 break-all text-[11px] text-emerald-700">{person.email || "Email not provided"}</p>



                        </div>)}



                      </div>



                    )}



                  </div>



                ))}



              </div>



            </section>



          )}



          {callCentreAgent ? (



            <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">



              <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-4">



                <h3 className="text-sm font-bold text-emerald-950">Municipal Teams Available to the Call Centre</h3>



                <p className="mt-1 text-xs leading-5 text-emerald-800">



                  Municipality-wide availability across all departments and sections. Use these contacts when directing or following up on complaints.



                </p>



              </div>



              <div className="grid gap-4 p-4 lg:grid-cols-2">



                <div className="overflow-hidden rounded-lg border border-emerald-200">



                  <div className="flex items-center justify-between gap-2 bg-emerald-100 px-4 py-3">



                    <div>



                      <h4 className="text-xs font-bold text-emerald-950">Team Available During the Day</h4>



                      <p className="mt-1 text-[11px] text-emerald-800">Active staff not marked for standby</p>



                    </div>



                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-900">{dayTeam.length}</span>



                  </div>



                  {dayTeam.length === 0 ? (



                    <p className="p-4 text-xs text-gray-500">No active day-availability staff are currently listed.</p>



                  ) : (



                    <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">



                      {dayTeam.map((person) => (



                        <div key={person.id} className="rounded-md border border-emerald-100 bg-white px-3 py-2">



                          <p className="text-xs font-semibold text-gray-900">{person.full_name}</p>



                          <p className="mt-1 text-[11px] text-gray-600">{person.designation}</p>



                          <p className="mt-1 text-[11px] font-medium text-emerald-800">{departments.find((item) => item.id === person.department_id)?.name ?? "Department not assigned"} · {sections.find((item) => item.id === person.section_id)?.name ?? "Section not assigned"}</p>



                          <p className="mt-1 text-[11px] text-gray-500">{person.contact_number}</p>



                          <p className="mt-1 break-all text-[11px] text-emerald-700">{person.email || "Email not provided"}</p>



                        </div>



                      ))}



                    </div>



                  )}



                </div>



                <div className="overflow-hidden rounded-lg border border-amber-200">



                  <div className="flex items-center justify-between gap-2 bg-amber-100 px-4 py-3">



                    <div>



                      <h4 className="text-xs font-bold text-amber-950">Team Available on Standby</h4>



                      <p className="mt-1 text-[11px] text-amber-800">Active staff marked as standby available</p>



                    </div>



                    <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-900">{standbyTeam.length}</span>



                  </div>



                  {standbyTeam.length === 0 ? (



                    <p className="p-4 text-xs text-gray-500">No active staff are currently marked as available for standby.</p>



                  ) : (



                    <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">



                      {standbyTeam.map((person) => (



                        <div key={person.id} className="rounded-md border border-amber-100 bg-white px-3 py-2">



                          <p className="text-xs font-semibold text-gray-900">{person.full_name}</p>



                          <p className="mt-1 text-[11px] text-gray-600">{person.designation}</p>



                          <p className="mt-1 text-[11px] font-medium text-amber-800">{departments.find((item) => item.id === person.department_id)?.name ?? "Department not assigned"} · {sections.find((item) => item.id === person.section_id)?.name ?? "Section not assigned"}</p>



                          <p className="mt-1 text-[11px] text-gray-500">{person.contact_number}</p>



                          <p className="mt-1 break-all text-[11px] text-emerald-700">{person.email || "Email not provided"}</p>



                        </div>



                      ))}



                    </div>



                  )}



                </div>



              </div>



            </section>



          ) : (



            <section className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">



              <div className="flex flex-col justify-between gap-2 border-b border-amber-100 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center">



                <div>



                  <h3 className="text-sm font-bold text-amber-950">Standby Available Team</h3>



                  <p className="mt-1 text-xs text-amber-800">Active personnel marked as available for standby, grouped by section.</p>



                </div>



                <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold text-amber-950">{standbyTeam.length} available</span>



              </div>



              {standbyTeam.length === 0 ? (



                <p className="p-5 text-sm text-gray-500">No active personnel have been marked as standby available.</p>



              ) : (



                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">



                  {standbyTeam.map((person) => (



                    <div key={person.id} className="rounded-lg border border-amber-100 p-3">



                      <p className="text-sm font-semibold text-gray-900">{person.full_name}</p>



                      <p className="mt-1 text-xs text-gray-600">{person.designation}</p>



                      <p className="mt-2 text-xs font-medium text-amber-800">{sections.find((section) => section.id === person.section_id)?.name ?? "Section not found"}</p>



                      <p className="mt-1 text-xs text-gray-500">{person.contact_number}</p>



                    </div>



                  ))}



                </div>



              )}



            </section>



          )}



          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">



            <div className="border-b border-gray-100 p-5">



              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">



                <div>



                  <h3 className="text-sm font-bold text-gray-900">Registered Personnel</h3>



                  <p className="mt-1 text-xs text-gray-500">



                    Only active personnel should be selected for new assignments and dispatches.



                  </p>



                </div>



                <button



                  onClick={() => void loadData()}



                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-50"



                >



                  Refresh list



                </button>



              </div>



              <div className={`mt-4 grid grid-cols-1 gap-3 ${admin ? "md:grid-cols-3" : "md:grid-cols-2"}`}>



                <input



                  value={search}



                  onChange={(event) => setSearch(event.target.value)}



                  placeholder="Search name, designation or contact…"



                  className={inputClass}



                />



                {(admin || clerk) && (



                  <select



                    value={departmentFilter}



                    onChange={(event) => {



                      setDepartmentFilter(event.target.value);



                      setSectionFilter("");



                    }}



                    className={inputClass}



                  >



                    <option value="">All departments</option>



                    {departments.map((department) => (



                      <option key={department.id} value={department.id}>



                        {department.name}



                      </option>



                    ))}



                  </select>



                )}



                <select



                  value={sectionFilter}



                  onChange={(event) => setSectionFilter(event.target.value)}



                  className={inputClass}



                >



                  <option value="">{admin || clerk || callCentreAgent ? "All sections" : "My section"}</option>



                  {visibleSections.map((section) => (



                    <option key={section.id} value={section.id}>



                      {section.name}



                    </option>



                  ))}



                </select>



              </div>



            </div>



            {loading ? (



              <div className="p-12 text-center text-sm text-gray-500">Loading personnel…</div>



            ) : departmentGroups.length === 0 ? (



              <div className="p-12 text-center">



                <p className="text-sm font-semibold text-gray-800">No departments found</p>



                <p className="mt-2 text-xs text-gray-500">Adjust your filters and try again.</p>



              </div>



            ) : (



              <div className="space-y-3 p-4 sm:p-5">



                {departmentGroups.map((department) => {



                  const isCollapsed = collapsedDepartments.includes(department.id);



                  const departmentPeople = department.sections.reduce((total, section) => total + section.people.length, 0);



                  return (



                    <section key={department.id} className="overflow-hidden rounded-[20px] border border-emerald-100 bg-[#f2fbf5] shadow-sm shadow-slate-200/70">



                      <button



                        type="button"



                        onClick={() => toggleDepartment(department.id)}



                        aria-expanded={!isCollapsed}



                        className="flex min-h-[84px] w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-emerald-50 sm:px-6"



                      >



                        <span className="flex min-w-0 items-center gap-4">



                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-800 text-xl font-semibold text-white shadow-sm" aria-hidden="true">▥</span>



                          <span className="min-w-0">



                            <span className="block text-sm font-extrabold text-slate-950 sm:text-base">{department.name}</span>



                            <span className="mt-1 block text-xs text-slate-500">{department.sections.length} sections · {departmentPeople} team members</span>



                          </span>



                        </span>



                        <span className="flex shrink-0 items-center gap-5 sm:gap-7">



                          <span className="hidden text-xs font-medium text-emerald-800 sm:inline">{isCollapsed ? "Expand" : "Minimise"}</span>



                          <span className="flex h-8 w-8 items-center justify-center rounded-full text-emerald-800 transition-transform" aria-hidden="true">



                            <svg className={`h-5 w-5 transition-transform ${isCollapsed ? "" : "rotate-180"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>



                          </span>



                          <span className="min-w-[42px] text-right">



                            <span className="block text-2xl font-extrabold leading-none text-emerald-800">{departmentPeople}</span>



                            <span className="mt-1 block text-[10px] text-slate-500">Team members</span>



                          </span>



                        </span>



                      </button>



                      {!isCollapsed && (



                        <div className="space-y-4 p-3 sm:p-4">



                          {department.sections.map((section) => {



                            const sectionStandby = section.people.filter(



                              (person) => person.is_active && getDutyType(person) === "standby"



                            );



                            const sectionOvertime = section.people.filter(



                              (person) => person.is_active && getDutyType(person) === "overtime"



                            );



                            // Day-shift availability is the active team not flagged for standby.



                            const sectionDayTeam = section.people.filter(



                              (person) => person.is_active && getDutyType(person) === "day_shift"



                            );



                            return (



                            <div key={section.id} className="overflow-hidden rounded-lg border border-gray-200">



                              <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50 px-4 py-3">



                                <div>



                                  <h4 className="text-xs font-bold text-emerald-950">{section.name}</h4>



                                  <p className="mt-1 text-[11px] text-emerald-800">{section.people.length} team members</p>



                                  <p className="mt-1 text-[11px] font-semibold text-amber-800">



                                    {sectionStandby.length} standby {sectionStandby.length === 1 ? "team member" : "team members"} available



                                  </p>



                                </div>



                                {canManageStaff && <button type="button" onClick={() => openAddForSection(section)} className="rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100">+ Add staff</button>}



                              </div>



                              <div className="border-b border-amber-100 bg-amber-50/70 px-4 py-3">



                                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-900">Section standby availability</p>



                                {sectionStandby.length === 0 ? (



                                  <p className="text-xs text-amber-800">No active personnel currently marked as available for standby in this section.</p>



                                ) : (



                                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">



                                    {sectionStandby.map((person) => (



                                      <div key={person.id} className="rounded-md border border-amber-200 bg-white px-3 py-2">



                                        <p className="text-xs font-semibold text-gray-900">{person.full_name}</p>



                                        <p className="mt-1 text-[11px] text-gray-600">{person.designation}</p>



                                        <p className="mt-1 text-[11px] text-amber-800">{person.contact_number}</p>



                                         <p className="mt-1 break-all text-[11px] text-emerald-700">{person.email || "Email not provided"}</p>



                                      </div>



                                    ))}



                                  </div>



                                )}



                              </div>



                              <div className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-3">



                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">



                                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-900">Team available during the day</p>



                                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-900">{sectionDayTeam.length} available</span>



                                </div>



                                {sectionDayTeam.length === 0 ? (



                                  <p className="text-xs text-emerald-800">No active day-shift personnel are currently listed for this section.</p>



                                ) : (



                                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">



                                    {sectionDayTeam.map((person) => (



                                      <div key={person.id} className="rounded-md border border-emerald-200 bg-white px-3 py-2">



                                        <p className="text-xs font-semibold text-gray-900">{person.full_name}</p>



                                        <p className="mt-1 text-[11px] text-gray-600">{person.designation}</p>



                                        <p className="mt-1 text-[11px] text-emerald-800">{person.contact_number}</p>



                                         <p className="mt-1 break-all text-[11px] text-emerald-700">{person.email || "Email not provided"}</p>



                                      </div>



                                    ))}



                                  </div>



                                )}



                              </div>



                              <div className="border-b border-orange-100 bg-orange-50/70 px-4 py-3">



                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">



                                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-900">Personnel assigned to overtime</p>



                                  <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-bold text-orange-900">{sectionOvertime.length} assigned</span>



                                </div>



                                {sectionOvertime.length === 0 ? (



                                  <p className="text-xs text-orange-800">No active personnel are currently assigned to overtime in this section.</p>



                                ) : (



                                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">



                                    {sectionOvertime.map((person) => (



                                      <div key={person.id} className="rounded-md border border-orange-200 bg-white px-3 py-2">



                                        <p className="text-xs font-semibold text-gray-900">{person.full_name}</p>



                                        <p className="mt-1 text-[11px] text-gray-600">{person.designation}</p>



                                        <p className="mt-1 text-[11px] text-orange-800">{person.contact_number}</p>



                                        <p className="mt-1 break-all text-[11px] text-emerald-700">{person.email || "Email not provided"}</p>



                                      </div>



                                    ))}



                                  </div>



                                )}



                              </div>



                              {section.people.length === 0 ? (



                                <p className="px-4 py-4 text-xs text-gray-500">No personnel registered in this section yet.</p>



                              ) : (



                                <div className="overflow-x-auto">



                                  <table className="w-full min-w-[980px] text-left">



                                    <thead className="bg-gray-50"><tr>{(canManageStaff ? ["Staff Member", "Designation", "Email", "Contact", "Shift", "Status", "Actions"] : ["Staff Member", "Designation", "Email", "Contact", "Shift", "Status"]).map((heading) => <th key={heading} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">{heading}</th>)}</tr></thead>



                                    <tbody className="divide-y divide-gray-100">



                                      {section.people.map((person) => (



                                        <tr key={person.id} className="hover:bg-emerald-50/30">



                                          <td className="px-4 py-3"><p className="text-xs font-semibold text-gray-900">{person.full_name}</p><p className="mt-1 text-[11px] text-gray-500">{person.employee_number || "No employee number"}</p></td>



                                          <td className="px-4 py-3 text-xs">{person.designation}</td>



                                          <td className="px-4 py-3 text-xs break-all">{person.email || "Not provided"}</td>



                                          <td className="px-4 py-3 text-xs tabular-nums">{person.contact_number}</td>



                                          <td className="px-4 py-3 text-xs">{person.shift_type === "06:00-14:00" ? "06:00–14:00" : person.shift_type === "14:00-22:00" ? "14:00–22:00" : getDutyType(person) === "day_shift" ? "Day Shift" : getDutyType(person) === "standby" ? "Standby" : getDutyType(person) === "overtime" ? "Overtime" : "Day Shift"}</td>



                                          <td className="px-4 py-3"><span className={`text-xs font-semibold ${person.is_active ? "text-emerald-700" : "text-gray-400"}`}>{person.is_active ? "Active" : "Inactive"}</span><p className={`mt-1 text-[11px] font-semibold ${person.is_active && person.standby_available ? "text-amber-700" : "text-gray-400"}`}>{person.is_active ? (getDutyType(person) === "standby" ? "Standby" : getDutyType(person) === "overtime" ? "Overtime" : "Day Shift") : "Inactive"}</p></td>



                                          {canManageStaff && <td className="px-4 py-3"><div className="flex items-center gap-3"><button onClick={() => openEdit(person)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-900">Edit</button><button onClick={() => void toggleStatus(person)} className="text-xs font-semibold text-amber-700">{person.is_active ? "Deactivate" : "Activate"}</button></div></td>}



                                        </tr>



                                      ))}



                                    </tbody>



                                  </table>



                                </div>



                              )}



                            </div>



                            );



                          })}



                        </div>



                      )}



                    </section>



                  );



                })}



              </div>



            )}



            <div className="border-t border-gray-100 px-5 py-3 text-[11px] text-gray-500">



              Showing {filteredStaff.length} of {staff.length} personnel



            </div>



          </section>



        </div>



      </main>



      {showForm && (



        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-950/50 p-3 sm:p-6">



          <div role="dialog" aria-modal="true" aria-labelledby="staff-form-title" className="my-auto w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl">



            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">



              <div>



                <h2 id="staff-form-title" className="text-base font-bold text-gray-900">



                  {editingId ? "Edit Staff Record" : "Add Staff Member"}



                </h2>



                <p className="mt-1 text-xs text-gray-500">



                  {admin ? "Select the appropriate department and section." : clerk ? "Your department and section are detected automatically from your Clerk profile." : "This record will be assigned to your section."}



                </p>



              </div>



              <button onClick={() => setShowForm(false)} className="px-2 text-xl text-gray-400" aria-label="Close">×</button>



            </div>



            <form onSubmit={saveStaff}>



              <div className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2 sm:p-6">



                <Field label="Full name \*">



                  <input required value={form.full_name} onChange={(event) => updateField("full_name", event.target.value)} className={inputClass} placeholder="Full name and surname" />



                </Field>



                <div className="col-span-full border-b border-gray-100 pb-2 pt-1">



                  <h3 className="text-sm font-bold text-gray-900">Contact Information</h3>



                  <p className="mt-1 text-xs text-gray-500">Provide the staff member’s email address and contact details.</p>



                </div>



                <Field label="Email address \\\*">



                  <input



                    required



                    type="email"



                    autoComplete="email"



                    value={form.email}



                    onChange={(event) => updateField("email", event.target.value.trimStart())}



                    className={inputClass}



                    placeholder="name\\@emalahleni.gov.za"



                  />



                </Field>



                <Field label="Employee number (optional)">



                  <input value={form.employee_number} onChange={(event) => updateField("employee_number", event.target.value)} className={inputClass} placeholder="Employee number" />



                </Field>



                <Field label="Designation \*">



                  <input required value={form.designation} onChange={(event) => updateField("designation", event.target.value)} className={inputClass} placeholder="e.g. Superintendent" />



                </Field>



                <Field label="Contact number \*">



                  <input required type="tel" inputMode="numeric" maxLength={10} value={form.contact_number} onChange={(event) => updateField("contact_number", event.target.value.replace(/\D/g, "").slice(0, 10))} className={inputClass} placeholder="10-digit contact number" />



                </Field>



                <Field label="Department \*">



                  <select



                    required



                    disabled={supervisor || clerk}



                    value={form.department_id}



                    onChange={(event) => void changeDepartment(event.target.value)}



                    className={inputClass}



                  >



                    <option value="">Select department</option>



                    {departments.map((department) => (



                      <option key={department.id} value={department.id}>{department.name}</option>



                    ))}



                  </select>



                </Field>



                <Field label="Section \*">



                  <select



                    required



                    disabled={supervisor || clerk || !form.department_id}



                    value={form.section_id}



                    onChange={(event) => updateField("section_id", event.target.value)}



                    className={inputClass}



                  >



                    <option value="">Select section</option>



                    {formSections.map((section) => (



                      <option key={section.id} value={section.id}>{section.name}</option>



                    ))}



                  </select>



                </Field>



                {isCallCentreDisasterSection(sections.find((section) => section.id === form.section_id)?.name ?? formSections.find((section) => section.id === form.section_id)?.name ?? "") && (



                  <Field label="Call Centre / Disaster Management shift \\\*">



                    <select required value={form.shift_type} onChange={(event) => updateField("shift_type", event.target.value)} className={inputClass}>



                      <option value="">Select shift</option>



                      <option value="06:00-14:00">Morning shift (06:00–14:00)</option>



                      <option value="14:00-22:00">Afternoon shift (14:00–22:00)</option>



                    </select>



                  </Field>



                )}



                <Field label="Personnel status">



                  <select value={form.is_active ? "active" : "inactive"} onChange={(event) => updateField("is_active", event.target.value === "active")} className={inputClass}>



                    <option value="active">Active</option>



                    <option value="inactive">Inactive</option>



                  </select>



                </Field>



                <Field label="Duty assignment \\\*">



                  <select



                    required



                    disabled={!form.is_active}



                    value={form.duty_type}



                    onChange={(event) => {



                      updateField("duty_type", event.target.value);



                      updateField("standby_available", event.target.value === "standby");



                    }}



                    className={inputClass}



                  >



                    <option value="day_shift">Day Shift</option>



                    <option value="standby">Standby</option>



                    <option value="overtime">Overtime</option>



                  </select>



                  <p className="mt-1 text-[11px] text-gray-500">Select the staff member's current duty assignment. This determines which availability list they appear in.</p>



                </Field>



                <div className="flex items-end">



                  <p className="text-[11px] leading-5 text-gray-500">



                    Inactive personnel remain in the directory for historical records but should not be selected for new dispatches.



                  </p>



                </div>



                {error && <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}



              </div>



              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-4">



                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold">Cancel</button>



                <button disabled={saving} type="submit" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">



                  {saving ? "Saving…" : editingId ? "Save Changes" : "Add Staff"}



                </button>



              </div>



            </form>



          </div>



        </div>



      )}



    </div>



  );



}



function NavLink({



  href,



  label,



  icon,



  active = false,



}: {



  href: string;



  label: string;



  icon: string;



  active?: boolean;



}) {



  return (



    <Link



      href={href}



      className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[11px] font-bold transition-all duration-200 ${



        active



          ? "bg-white/10 text-white shadow-sm shadow-black/10"



          : "text-white/85 hover:bg-white/10 hover:text-white"



      }`}



    >



      {active && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-white" />}



      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[15px] ${



        active ? "bg-white/15 text-white" : "bg-white/10 text-white/80 group-hover:bg-white/15"



      }`}>{icon}</span>



      <span className="flex-1">{label}</span>



      {active && <span className="text-xs text-white/80">→</span>}



    </Link>



  );



}



function Field({ label, children }: { label: string; children: React.ReactNode }) {



  return (



    <label className="block">



      <span className="mb-1.5 block text-xs font-semibold text-gray-700">{label}</span>



      {children}



    </label>



  );



}



function Stat({ label, value, icon }: { label: string; value: number; icon: string }) {



  return (



    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">



      <div className="flex items-center justify-between">



        <p className="text-xs font-medium text-gray-500">{label}</p>



        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-lg font-bold text-emerald-700">{icon}</span>



      </div>



      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>



    </div>



  );



}
