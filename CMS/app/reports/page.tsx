"use client";







import { useEffect, useMemo, useState } from "react";







import Image from "next/image";







import Link from "next/link";







import { usePathname, useRouter } from "next/navigation";







import { createClient } from "@/lib/supabase/client";







type Complaint = {







  id: string;







  subject: string;







  department: string;







  section: string;







  status: string;







  assignmentStatus: string;







  workStatus: string;







  priority: string;







  dateReported: string;







  dateResolved: string;







  area: string;
  raw: any;







};







const inputClass =







  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100";







const statusStyles: Record<string, string> = {







  New: "bg-sky-50 text-sky-700",

  Received: "bg-cyan-50 text-cyan-700",

  Completed: "bg-emerald-50 text-emerald-700",

  "In Process": "bg-amber-50 text-amber-700",







  Assigned: "bg-violet-50 text-violet-700",







  "In Progress": "bg-amber-50 text-amber-700",







  Pending: "bg-orange-50 text-orange-700",







  Escalated: "bg-rose-50 text-rose-700",







  Resolved: "bg-emerald-50 text-emerald-700",







  Closed: "bg-slate-100 text-slate-700",







  Overdue: "bg-red-50 text-red-700",







};







const REPORT_WORK_STATUSES = [

  "Received",

  "Will Attend",

  "Assessing Situation",

  "Work In Progress",

  "Delayed",

  "Resources Required",

  "Awaiting Resources",

  "Escalated",

  "Work Completed",

  "Unable to Resolve",

];



const REPORT_COMPLAINT_STATUSES = [

  "New",

  "Received",

  "Assigned",

  "Unassigned",

  "In Progress",

  "In Process",

  "Pending",

  "Escalated",

  "Resolved",

  "Completed",

  "Closed",

  "Overdue",

];



function isComplaintAssignedRow(row: any): boolean {

  const values = [

    row?.assigned_to,

    row?.assigned_user_id,

    row?.assigned_staff_id,

    row?.technician_id,

    row?.assigned_technician_id,

    row?.team_id,

    row?.assigned_team_id,

    row?.assigned_team,

  ];

  return values.some((value) => {

    if (value === null || value === undefined) return false;

    if (typeof value === "string") return value.trim() !== "";

    if (Array.isArray(value)) return value.length > 0;

    return Boolean(value);

  });

}



const priorityStyles: Record<string, string> = {







  Low: "text-sky-700",







  Medium: "text-amber-700",







  High: "text-orange-700",







  Critical: "text-red-700",







};







// Waste Management issue types available in the Reports issue filter. These are







// filter labels only; reports still count actual complaint records from Supabase.







const WASTE_MANAGEMENT_ISSUES: { label: string; keywords: string[] }[] = [







  { label: "Refuse collection not done", keywords: ["refuse collection not done", "missed refuse collection", "missed collection"] },







  { label: "Refuse collection schedule not followed", keywords: ["collection schedule", "schedule not followed"] },







  { label: "Delayed refuse collection", keywords: ["delayed refuse", "late refuse", "delayed collection"] },







  { label: "Incomplete refuse collection", keywords: ["incomplete refuse", "partially collected", "part collection"] },







  { label: "Refuse bags left behind", keywords: ["bags left behind", "refuse left behind", "waste left behind"] },







  { label: "Refuse vehicle failed to arrive", keywords: ["vehicle failed to arrive", "refuse truck", "collection vehicle"] },







  { label: "Illegal dumping of household waste", keywords: ["illegal dumping", "household waste dumping"] },







  { label: "Illegal dumping of construction rubble", keywords: ["construction rubble", "building rubble"] },







  { label: "Illegal dumping on vacant land", keywords: ["vacant land", "open land"] },







  { label: "Illegal dumping along roads", keywords: ["dumping along roads", "roadside dumping"] },







  { label: "Damaged refuse bin", keywords: ["damaged refuse bin", "broken bin", "damaged bin"] },







  { label: "Missing refuse bin", keywords: ["missing refuse bin", "missing bin"] },







  { label: "Request for a refuse bin", keywords: ["request for a refuse bin", "need a bin", "new refuse bin"] },







  { label: "Overflowing communal bins", keywords: ["overflowing communal", "communal bin", "overflowing bin"] },







  { label: "Accumulated waste in public areas", keywords: ["accumulated waste", "waste accumulation"] },







  { label: "Littering in streets and open spaces", keywords: ["littering", "litter in streets", "open spaces"] },







  { label: "Dirty public areas", keywords: ["dirty public area", "unclean public area"] },







  { label: "Waste blocking stormwater drains", keywords: ["stormwater drain", "drain blocked by waste", "waste blocking drains"] },







  { label: "Landfill site concerns", keywords: ["landfill"] },







  { label: "Unauthorised waste disposal", keywords: ["unauthorised waste disposal", "unauthorized waste disposal"] },







  { label: "Recycling collection not done", keywords: ["recycling collection", "recycling not collected"] },







  { label: "Recycling point overflowing", keywords: ["recycling point", "recycling bin overflowing"] },







  { label: "Garden waste not collected", keywords: ["garden waste", "green waste"] },







  { label: "Fallen branches and green waste not removed", keywords: ["fallen branches", "tree branches", "green waste not removed"] },







  { label: "Furniture and bulky household waste not collected", keywords: ["bulky waste", "furniture", "large household waste"] },







  { label: "Foul odours from accumulated waste", keywords: ["foul odour", "bad smell", "waste smell"] },







  { label: "Pest infestation caused by accumulated waste", keywords: ["pest infestation", "rats", "rodents", "flies caused by waste"] },







];







function csvQuote(value: unknown) {







  return `"${String(value ?? "").replace(/"/g, '""')}"`;







}







function downloadCSV(rows: Complaint[]) {







  const headers = [







    "Reference Number", "Subject", "Department", "Section", "Status",







    "Assignment Status", "Work / Resources Status", "Priority", "Date Reported", "Date Resolved", "Area",
    "Complainant", "Contact Number", "Ward", "Street Address", "Description", "Category",
    "Assigned Official", "Assigned Team", "Resources Needed", "Resource Status", "Resolution Details",







  ];







  const content = [headers, ...rows.map((item) => [







    item.id, item.subject, item.department, item.section, item.status,







    item.assignmentStatus, item.workStatus, item.priority, item.dateReported, item.dateResolved, item.area,
    item.raw?.complainant_name ?? item.raw?.customer_name ?? item.raw?.reporter_name ?? "",
    item.raw?.contact_number ?? item.raw?.phone_number ?? item.raw?.customer_phone ?? "",
    item.raw?.ward_number ?? item.raw?.ward ?? "",
    item.raw?.street_address ?? item.raw?.address ?? item.area,
    item.raw?.description ?? item.raw?.complaint_description ?? item.raw?.details ?? "",
    item.raw?.category ?? item.raw?.subject_category ?? "",
    item.raw?.assigned_to_name ?? item.raw?.assigned_staff_name ?? item.raw?.assignee_name ?? "",
    Array.isArray(item.raw?.assigned_team) ? item.raw.assigned_team.join("; ") : (item.raw?.assigned_team ?? ""),
    item.raw?.resources_needed ?? "", item.raw?.resource_status ?? "",
    item.raw?.resolution_details ?? item.raw?.resolution_notes ?? item.raw?.outcome ?? "",







  ])].map((row) => row.map(csvQuote).join(",")).join("\r\n");







  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });







  const url = URL.createObjectURL(blob);







  const anchor = document.createElement("a");







  anchor.href = url;







  anchor.download = "Emalahleni_Complaints_Report.csv";







  anchor.click();







  URL.revokeObjectURL(url);







}







function MetricCard({







  label, value, note, icon, accent,







}: {







  label: string; value: number | string; note: string; icon: string; accent: string;







}) {







  return (







    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">







      <div className="flex items-start justify-between gap-3">







        <div>







          <p className="text-xs font-medium text-slate-500">{label}</p>







          <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>







          <p className="mt-1 text-xs text-slate-400">{note}</p>







        </div>







        <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${accent}`}>{icon}</span>







      </div>







    </div>







  );







}







function BarRow({ label, value, total, color }: {







  label: string; value: number; total: number; color: string;







}) {







  const percentage = total ? Math.round((value / total) * 100) : 0;







  return (







    <div className="space-y-2">







      <div className="flex items-center justify-between gap-3 text-xs">







        <span className="min-w-0 truncate text-slate-600">{label}</span>







        <span className="shrink-0 font-semibold tabular-nums text-slate-800">







          {value} <span className="ml-1 font-normal text-slate-400">({percentage}%)</span>







        </span>







      </div>







      <div className="h-2 overflow-hidden rounded-full bg-slate-100">







        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${percentage}%` }} />







      </div>







    </div>







  );







}







export default function ReportsPage() {







  const supabase = createClient();







  const router = useRouter();







  const pathname = usePathname();







  const [complaints, setComplaints] = useState<Complaint[]>([]);

  const [communityAlertEvents, setCommunityAlertEvents] = useState<any[]>([]);
  const [complaintStatusHistory, setComplaintStatusHistory] = useState<any[]>([]);
  const [departmentAssistanceRequests, setDepartmentAssistanceRequests] = useState<any[]>([]);
  const [operationalUpdates, setOperationalUpdates] = useState<any[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<any[]>([]);
  const [wardTeamAssignments, setWardTeamAssignments] = useState<any[]>([]);
  const [wardFollowUps, setWardFollowUps] = useState<any[]>([]);
  const [deletionActivities, setDeletionActivities] = useState<any[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<any[]>([]);

  const [collapsedAlertDates, setCollapsedAlertDates] = useState<string[]>([]);







  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);







  const [isSupervisorReport, setIsSupervisorReport] = useState(false);
  const [isDepartmentReport, setIsDepartmentReport] = useState(false);
  const [reportScopeLabel, setReportScopeLabel] = useState("All municipal departments");







  const [isCallCentreAgentReport, setIsCallCentreAgentReport] = useState(false);







  const [isAdministratorReport, setIsAdministratorReport] = useState(false);







  const [supervisorSectionName, setSupervisorSectionName] = useState("Your section");







  const [loading, setLoading] = useState(true);







  const [loadError, setLoadError] = useState("");







  const [departmentFilter, setDepartmentFilter] = useState("All Departments");
  const [sectionFilter, setSectionFilter] = useState("All Sections");
  const [wardFilter, setWardFilter] = useState("All Wards");







  const [issueFilter, setIssueFilter] = useState("All Issues");







  const [statusFilter, setStatusFilter] = useState("All Statuses");

  const [workStatusFilter, setWorkStatusFilter] = useState("All Work Statuses");







  const [priorityFilter, setPriorityFilter] = useState("All Priorities");







  const [periodFilter, setPeriodFilter] = useState("All Dates");







  const [search, setSearch] = useState("");







  const [userName, setUserName] = useState("Loading account…");







  const [userEmail, setUserEmail] = useState("");







  const [signingOut, setSigningOut] = useState(false);







  const [currentTimestamp, setCurrentTimestamp] = useState<number | null>(null);







  useEffect(() => {







    setCurrentTimestamp(Date.now());







  }, []);







  useEffect(() => {







    let active = true;







    async function loadPageData() {







      setLoading(true);







      setLoadError("");







      const [







        { data: authData },







        { data: departmentRows, error: departmentError },







        { data: sectionRows, error: sectionError },

        { data: workUpdateRows, error: workUpdateError },

        { data: assignmentHistoryRows, error: assignmentHistoryError },

        { data: communityAlertRows, error: communityAlertError },
        { data: complaintStatusRows, error: complaintStatusError },
        { data: wardTeamRows, error: wardTeamError },
        { data: wardFollowUpRows, error: wardFollowUpError },
        { data: deletionRows, error: deletionError },
        { data: staffRows, error: staffError },







      ] = await Promise.all([







        supabase.auth.getUser(),







        supabase.from("departments").select("*"),







        supabase.from("sections").select("*"),

        supabase.from("complaint_work_updates").select("*").order("created_at", { ascending: false }),

        supabase.from("complaint_assignment_history").select("*").order("created_at", { ascending: false }),

        supabase.from("ward_alert_events").select("*").order("created_at", { ascending: false }),
        supabase.from("complaint_updates").select("*").order("created_at", { ascending: false }),
        supabase.from("ward_alert_team_assignments").select("*").order("created_at", { ascending: false }),
        supabase.from("ward_alert_follow_up_updates").select("*").order("created_at", { ascending: false }),
        supabase.from("complaint_deletion_activity").select("*").order("deleted_at", { ascending: false }),
        supabase.from("staff_directory").select("*").order("full_name", { ascending: true }),







      ]);







      if (!active) return;







      const user = authData.user;







      let complaintQuery = supabase.from("complaints").select("*").order("created_at", { ascending: false });







      let sectionId: string | null = null;
      let departmentId: string | null = null;
      let isSupervisor = false;
      let isDepartmentScoped = false;







      const departmentNameById = new Map<string, string>(







        (departmentRows ?? []).map((row: any) => [String(row.id), String(row.name ?? row.department_name ?? row.title ?? "").trim()]),







      );







      const sectionNameById = new Map<string, string>(







        (sectionRows ?? []).map((row: any) => [String(row.id), String(row.name ?? row.section_name ?? row.title ?? "").trim()]),







      );







      if (!user) {







        window.location.assign("/login");







        return;







      }







      const [{ data: profile, error: profileError }, { data: permissionRow, error: permissionError }] = await Promise.all([







        supabase.from("profiles").select("access_level, job_title, section_id, department_id, is_active").eq("id", user.id).maybeSingle(),







        supabase.from("user_permissions").select("pages").eq("user_id", user.id).maybeSingle(),







      ]);







      if (!active) return;







      const metadata = user.user_metadata ?? {};







      const appMetadata = user.app_metadata ?? {};







      const normalizeRole = (value: unknown) => String(value ?? "")







        .normalize("NFKC")







        .toLowerCase()







        .replace(/[_-]+/g, " ")







        .replace(/[()[\]{}*,]/g, " ")







        .replace(/\s+/g, " ")







        .trim();







      // Roles may be stored in the profile, user metadata, or app metadata,







      // depending on how the account was created. Check all known locations.







      const roleCandidates = [







        profile?.access_level,







        profile?.job_title,







        metadata.access_level,







        metadata.role,







        metadata.user_role,







        metadata.role_name,







        metadata.job_title,







        metadata.position,







        appMetadata.access_level,







        appMetadata.role,







        appMetadata.user_role,







        appMetadata.role_name,







      ].map(normalizeRole).filter(Boolean);







      const isAdministrator = roleCandidates.some((role) =>







        ["administrator", "system administrator", "admin", "system admin", "super admin", "super administrator", "municipal administrator"].includes(role)







      );







      const isCallCentreAgent = roleCandidates.some((role) =>







        /^(?:.*\s)?(?:call centre|call center) agent(?:\s+.*)?$/.test(role)







      );







      const isSupervisorRole = roleCandidates.some((role) =>
        role.includes("supervisor") || role === "clerk" || role.endsWith(" clerk")
      );
      const isDepartmentManagerRole = roleCandidates.some((role) =>
        role === "department manager" || role === "departmental manager"
      );
      const isAssistantManagerRole = roleCandidates.some((role) =>
        role === "assistant manager" || role === "deputy manager"
      );
      const isDirectorRole = roleCandidates.some((role) =>
        role === "director" || role.endsWith(" director")
      );
      const isMunicipalManagerRole = roleCandidates.some((role) =>
        role === "municipal manager" || role === "municipal manager office"
      );
      const isCommunicationsRole = roleCandidates.some((role) =>
        role === "communications" || role === "communications officer" || role.includes("communications")
      );
      const isDepartmentManagementRole =
        isDepartmentManagerRole || isAssistantManagerRole || isDirectorRole;
      setIsCallCentreAgentReport(isCallCentreAgent);
      setIsAdministratorReport(isAdministrator);
      setIsDepartmentReport(isDepartmentManagementRole);







      const normalizePage = (value: unknown) => String(value ?? "")







        .toLowerCase()







        .replace(/[_-]+/g, " ")







        .replace(/\s+/g, " ")







        .trim();







      const permittedPages = Array.isArray(permissionRow?.pages)







        ? permissionRow.pages.filter((page: unknown): page is string => typeof page === "string").map(normalizePage)







        : [];







      const hasReportsPermission = !permissionError && permittedPages.some((page) =>







        ["reports", "report", "reports analytics", "reports and analytics"].includes(page)







      );







      // Communications is an awareness/dashboard role and must not open Reports.
      // Department management roles receive department-scoped reports; Municipal
      // Manager receives municipality-wide reports. Supervisor and Clerk remain
      // restricted to their own section.
      const allowed =
        !isCommunicationsRole &&
        (isAdministrator || isCallCentreAgent || isSupervisorRole ||
          isDepartmentManagementRole || isMunicipalManagerRole || hasReportsPermission);







      if (profileError) {







        setLoadError(`Could not load your profile permissions: ${profileError.message}`);







      }







      if (!allowed) {







        window.location.replace("/dashboard?access=denied");







        return;







      }







      if (profile?.is_active === false) {







        setLoadError("This account is inactive. Please contact the system administrator.");







        setLoading(false);







        return;







      }







      if (profileError) {







        // Fail closed: never show unscoped complaint reports if permissions cannot be verified.







        isSupervisor = true;







        sectionId = null;







       } else {
        isSupervisor = isSupervisorRole;
        isDepartmentScoped = isDepartmentManagementRole;
        sectionId = profile?.section_id ? String(profile.section_id) : null;
        departmentId = profile?.department_id ? String(profile.department_id) : null;
        setIsSupervisorReport(isSupervisor);
        setIsDepartmentReport(isDepartmentScoped);

        if (isSupervisor) {
          if (sectionId) {
            complaintQuery = complaintQuery.eq("section_id", sectionId);
            const sectionName = sectionNameById.get(sectionId);
            if (sectionName) {
              setSupervisorSectionName(sectionName);
              setReportScopeLabel(sectionName);
            }
          } else {
            setLoadError("Your Supervisor/Clerk account is not linked to a section. Please ask an administrator to assign your section.");
          }
        } else if (isDepartmentScoped) {
          if (departmentId) {
            complaintQuery = complaintQuery.eq("department_id", departmentId);
            const departmentName = departmentNameById.get(departmentId);
            setReportScopeLabel(departmentName || "Your assigned department");
          } else {
            setLoadError("Your management account is not linked to a department. Please ask an administrator to assign your department.");
          }
        } else {
          setReportScopeLabel("All municipal departments");
        }
      }







      const { data: complaintRows, error: complaintError } = !user || (isSupervisor && !sectionId) || (isDepartmentScoped && !departmentId)







        ? { data: [], error: null }







        : await complaintQuery;







      if (!active) return;







      if (user) {







        const metadata = user.user_metadata ?? {};







        const fullName = [







          metadata.full_name,







          metadata.name,







          [metadata.first_name, metadata.last_name].filter(Boolean).join(" "),







        ].find((value) => typeof value === "string" && value.trim());







        setUserName(fullName || user.email || "Signed-in user");







        setUserEmail(user.email ?? "");







      } else {







        setUserName("Not signed in");







        setUserEmail("");







      }







      if (complaintError) {







        setLoadError(complaintError.message);







        setComplaints([]);







      } else {







        const latestAssignmentByComplaint = new Map<string, any>();

        (assignmentHistoryRows ?? []).forEach((assignment: any) => {

          const complaintId = String(assignment.complaint_id ?? assignment.complaintId ?? "");

          if (complaintId && !latestAssignmentByComplaint.has(complaintId)) {

            latestAssignmentByComplaint.set(complaintId, assignment);

          }

        });

        if (assignmentHistoryError) {

          console.warn("Could not load complaint assignment history:", assignmentHistoryError.message);

        }



        const latestWorkUpdateByComplaint = new Map<string, any>();

        (workUpdateRows ?? []).forEach((update: any) => {

          const complaintId = String(update.complaint_id ?? update.complaintId ?? "");

          if (complaintId && !latestWorkUpdateByComplaint.has(complaintId)) {

            latestWorkUpdateByComplaint.set(complaintId, update);

          }

        });

        if (workUpdateError) {

          console.warn("Could not load complaint work-update statuses:", workUpdateError.message);

        }



        const mapped: Complaint[] = (complaintRows ?? []).map((row: any) => {

          const complaintId = String(row.id ?? row.complaint_id ?? "");

          const latestWorkUpdate = latestWorkUpdateByComplaint.get(complaintId);

          const latestAssignment = latestAssignmentByComplaint.get(complaintId);

          const assigned = isComplaintAssignedRow(row) || isComplaintAssignedRow(latestAssignment);

          const workflowStatus = String(row.status ?? "New");

          const assignmentStatus = assigned || workflowStatus.toLowerCase() === "assigned" ? "Assigned" : "Unassigned";

          const workStatus = String(

            latestWorkUpdate?.update_type ??

            latestWorkUpdate?.status ??

            latestWorkUpdate?.work_status ??

            ""

          ).trim();

          return ({







          id: String(row.reference_number ?? row.reference_no ?? row.ticket_no ?? row.id ?? ""),







          subject: String(row.subject ?? row.title ?? "Untitled complaint"),







          department: String(







            row.department ?? row.department_name ??







            departmentNameById.get(String(row.department_id ?? "")) ?? "",







          ),







          section: String(







            row.section ?? row.section_name ??







            sectionNameById.get(String(row.section_id ?? "")) ?? "",







          ),







          status: String(row.status ?? "New"),







          assignmentStatus,







          workStatus: workStatus || "Not recorded",







          priority: String(row.priority ?? "Medium"),







          dateReported: String(row.date_reported ?? row.created_at ?? "").slice(0, 10),







          dateResolved: String(row.date_resolved ?? row.resolved_at ?? row.closed_at ?? "").slice(0, 10),







          area: String(row.area ?? row.street_address ?? row.address ?? row.location ?? ""),
          raw: row,







          });

        });







        setComplaints(mapped);
        const visibleIds = new Set((complaintRows ?? []).map((row: any) => String(row.id ?? row.complaint_id ?? "")).filter(Boolean));
        const visibleRefs = new Set(mapped.map((item) => item.id));
        const belongsToVisibleComplaint = (row: any) => {
          const complaintId = String(row.complaint_id ?? row.complaintId ?? "");
          const reference = String(row.complaint_reference ?? row.reference_number ?? row.reference_no ?? "");
          return (complaintId && visibleIds.has(complaintId)) || (reference && visibleRefs.has(reference));
        };
        setOperationalUpdates((workUpdateRows ?? []).filter(belongsToVisibleComplaint));
        setAssignmentHistory((assignmentHistoryRows ?? []).filter(belongsToVisibleComplaint));
        setComplaintStatusHistory((complaintStatusRows ?? []).filter(belongsToVisibleComplaint));
        setDepartmentAssistanceRequests((complaintStatusRows ?? []).filter((row: any) =>
          belongsToVisibleComplaint(row) &&
          String(row.comment ?? "").startsWith("ASSISTANCE FROM ANOTHER DEPARTMENT")
        ));
        const belongsToVisibleWardOrComplaint = (row: any) => {
        const refs = Array.isArray(row.complaint_references) ? row.complaint_references.map(String) : [];
        const complaintIds = Array.isArray(row.complaint_ids) ? row.complaint_ids.map(String) : [];
        return refs.some((ref: string) => visibleRefs.has(ref)) ||
          complaintIds.some((id: string) => visibleIds.has(id));
      };
      setWardTeamAssignments((wardTeamRows ?? []).filter((row: any) =>
        (!isSupervisor && !isDepartmentScoped) || belongsToVisibleWardOrComplaint(row)
      ));
      setWardFollowUps((wardFollowUpRows ?? []).filter((row: any) =>
        (!isSupervisor && !isDepartmentScoped) || belongsToVisibleWardOrComplaint(row)
      ));
      setDeletionActivities((deletionRows ?? []).filter((row: any) => {
        if (isSupervisor) return String(row.section_id ?? "") === String(sectionId ?? "") ||
          String(row.section ?? "").toLowerCase() === supervisorSectionName.toLowerCase();
        if (isDepartmentScoped) return String(row.department_id ?? "") === String(departmentId ?? "");
        return true;
      }));
      setCommunityAlertEvents((communityAlertRows ?? []).filter((row: any) =>
        (!isSupervisor && !isDepartmentScoped) || belongsToVisibleWardOrComplaint(row)
      ));
      setStaffDirectory((staffRows ?? []).filter((row: any) => {
        if (isSupervisor) return String(row.section_id ?? "") === String(sectionId ?? "");
        if (isDepartmentScoped) return String(row.department_id ?? "") === String(departmentId ?? "");
        return true;
      }));







      }







      if (departmentError) {







        setLoadError((current) => current || departmentError.message);







      }







      if (sectionError) {







        setLoadError((current) => current || sectionError.message);







      }







      const dbDepartments = (departmentRows ?? [])







        .map((row: any) => String(row.name ?? row.department_name ?? row.title ?? "").trim())







        .filter(Boolean);







      const complaintDepartments = (complaintRows ?? [])







        .map((row: any) => String(row.department ?? row.department_name ?? "").trim())







        .filter(Boolean);







      // For Supervisors, build filter choices only from department values present in







      // their already section-scoped complaint records. Do not expose unrelated







      // departments from the global departments table in the report filters.







      const availableDepartments = (isSupervisor || isDepartmentScoped)
        ? complaintDepartments
        : [...dbDepartments, ...complaintDepartments];







      setDepartmentOptions(Array.from(new Set(availableDepartments)).sort());







      setLoading(false);







    }







    loadPageData();







    return () => { active = false; };







  }, []);







  const sectionOptions = useMemo(() => Array.from(new Set(complaints.map((item) => item.section).filter(Boolean))).sort(), [complaints]);
  const wardOptions = useMemo(() => Array.from(new Set(complaints.map((item) => String(item.raw?.ward_number ?? item.raw?.ward ?? "")).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [complaints]);

  const issueOptions = useMemo(() => Array.from(new Set([
    ...WASTE_MANAGEMENT_ISSUES.map((issue) => issue.label),
    ...complaints.map((item) => item.subject).filter(Boolean),
  ])).sort(), [complaints]);

  const statuses = useMemo(







    () => Array.from(new Set([...REPORT_COMPLAINT_STATUSES, ...complaints.map((item) => item.status).filter(Boolean)])).sort(),







    [complaints],







  );







  const workStatuses = useMemo(

    () => Array.from(new Set([...REPORT_WORK_STATUSES, ...complaints.map((item) => item.workStatus).filter(Boolean)])).sort(),

    [complaints],

  );



  const priorities = useMemo(







    () => Array.from(new Set(complaints.map((item) => item.priority).filter(Boolean))).sort(),







    [complaints],







  );







  const filteredComplaints = useMemo(() => {







    const now = currentTimestamp;







    const limits: Record<string, number> = { "Last 7 Days": 7, "Last 30 Days": 30, "Last 90 Days": 90 };







    return complaints.filter((item) => {







      if (departmentFilter !== "All Departments" && item.department !== departmentFilter) return false;
      if (sectionFilter !== "All Sections" && item.section !== sectionFilter) return false;
      if (wardFilter !== "All Wards" && String(item.raw?.ward_number ?? item.raw?.ward ?? "") !== wardFilter) return false;







      if (issueFilter !== "All Issues") {







        const selectedIssue = WASTE_MANAGEMENT_ISSUES.find((issue) => issue.label === issueFilter);







        const subjectText = item.subject.toLowerCase();







        if (!selectedIssue || !selectedIssue.keywords.some((keyword) => subjectText.includes(keyword))) return false;







      }







      if (statusFilter === "Assigned" && item.assignmentStatus !== "Assigned") return false;

      if (statusFilter === "Unassigned" && item.assignmentStatus !== "Unassigned") return false;

      if (statusFilter !== "All Statuses" && statusFilter !== "Assigned" && statusFilter !== "Unassigned" && item.status !== statusFilter) return false;

      if (workStatusFilter !== "All Work Statuses" && item.workStatus !== workStatusFilter) return false;







      if (priorityFilter !== "All Priorities" && item.priority !== priorityFilter) return false;







      if (periodFilter !== "All Dates" && item.dateReported && now !== null) {







        const reported = new Date(`${item.dateReported}T12:00:00`);







        const days = (now - reported.getTime()) / 86400000;







        if (days < 0 || days > limits[periodFilter]) return false;







      }







      const text = [item.id, item.subject, item.department, item.section, item.area, item.status, item.assignmentStatus, item.workStatus]







        .join(" ").toLowerCase();







      return text.includes(search.toLowerCase().trim());







    });







  }, [complaints, departmentFilter, sectionFilter, wardFilter, issueFilter, statusFilter, workStatusFilter, priorityFilter, periodFilter, search, currentTimestamp]);







  const communityAlertsByDate = useMemo(() => {

    const groups = new Map<string, any[]>();

    communityAlertEvents.forEach((event) => {

      const rawDate = String(event.created_at ?? event.event_date ?? event.alert_date ?? "");

      const dateKey = rawDate ? rawDate.slice(0, 10) : "Date not recorded";

      if (!groups.has(dateKey)) groups.set(dateKey, []);

      groups.get(dateKey)!.push(event);

    });

    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  }, [communityAlertEvents]);



  const communityAlertCount = communityAlertEvents.filter((event) =>

    ["councillor_alerted", "bulk_team_dispatched", "team_follow_up_call"].includes(String(event.action ?? ""))

  ).length;



  function exportCommunityAlertsCSV() {

    const headers = ["Date", "Ward", "Action", "Complaint Count", "Alert Key", "Details"];

    const rows = communityAlertEvents.map((event) => [

      event.created_at ?? event.event_date ?? event.alert_date ?? "",

      event.ward_number ?? event.ward ?? "",

      event.action ?? "",

      event.complaint_count ?? "",

      event.alert_key ?? "",

      event.details ?? event.description ?? event.notes ?? "",

    ]);

    const content = [headers, ...rows].map((row) => row.map(csvQuote).join(",")).join("\r\n");

    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");

    anchor.href = url;

    anchor.download = "Emalahleni_Community_Alerts_Report.csv";

    anchor.click();

    URL.revokeObjectURL(url);

  }



  const total = filteredComplaints.length;







  const resolved = filteredComplaints.filter((item) => ["Resolved", "Completed", "Closed"].includes(item.status) || item.workStatus === "Work Completed").length;

  const open = filteredComplaints.length - resolved;

  const assignedCount = filteredComplaints.filter((item) => item.assignmentStatus === "Assigned").length;

  const unassignedCount = filteredComplaints.filter((item) => item.assignmentStatus === "Unassigned").length;

  const resourcesRequiredCount = filteredComplaints.filter((item) => ["Resources Required", "Awaiting Resources"].includes(item.workStatus)).length;

  const delayedCount = filteredComplaints.filter((item) => item.workStatus === "Delayed").length;







  const overdue = filteredComplaints.filter((item) => item.status === "Overdue").length;







  const critical = filteredComplaints.filter((item) => item.priority === "Critical").length;







  const resolutionRate = total ? Math.round((resolved / total) * 100) : 0;







  const departmentStats = useMemo(() => {







    // Supervisors get one workload row for their own section, calculated only







    // from the section-scoped complaint records loaded for their account.







    if (isSupervisorReport) {







      const items = filteredComplaints;







      return [{







        department: supervisorSectionName,







        total: items.length,







        resolved: items.filter((item) => ["Resolved", "Closed"].includes(item.status)).length,







        open: items.filter((item) => !["Resolved", "Closed"].includes(item.status)).length,







        overdue: items.filter((item) => item.status === "Overdue").length,







      }];







    }







    return departmentOptions.map((department) => {







      const items = filteredComplaints.filter((item) => item.department === department);







      return {







        department,







        total: items.length,







        resolved: items.filter((item) => ["Resolved", "Closed"].includes(item.status)).length,







        open: items.filter((item) => !["Resolved", "Closed"].includes(item.status)).length,







        overdue: items.filter((item) => item.status === "Overdue").length,







      };







    }).sort((a, b) => b.total - a.total);







  }, [departmentOptions, filteredComplaints, isSupervisorReport, supervisorSectionName]);







  const statusStats = useMemo(() => statuses.map((label, index) => ({







    label,







    count: label === "Assigned"

      ? filteredComplaints.filter((item) => item.assignmentStatus === "Assigned").length

      : label === "Unassigned"

        ? filteredComplaints.filter((item) => item.assignmentStatus === "Unassigned").length

        : filteredComplaints.filter((item) => item.status === label).length,







    color: ["bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500", "bg-slate-500"][index % 6],







  })), [statuses, filteredComplaints]);







  const workStatusStats = useMemo(() => workStatuses.map((label, index) => ({

    label,

    count: filteredComplaints.filter((item) => item.workStatus === label).length,

    color: ["bg-green-600", "bg-amber-500", "bg-orange-500", "bg-rose-500", "bg-sky-500"][index % 5],

  })), [workStatuses, filteredComplaints]);



  const priorityStats = useMemo(() => priorities.map((label, index) => ({







    label,







    count: filteredComplaints.filter((item) => item.priority === label).length,







    color: ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-sky-500"][index % 4],







  })), [priorities, filteredComplaints]);







  const averageResolutionDays = useMemo(() => {







    const completed = filteredComplaints.filter((item) => item.dateResolved && item.dateReported);







    if (!completed.length) return "—";







    const daysTotal = completed.reduce((sum, item) => {







      const start = new Date(`${item.dateReported}T12:00:00`).getTime();







      const end = new Date(`${item.dateResolved}T12:00:00`).getTime();







      return sum + Math.max(0, (end - start) / 86400000);







    }, 0);







    return (daysTotal / completed.length).toFixed(1);







  }, [filteredComplaints]);







  async function handleSignOut() {







    setSigningOut(true);







    const { error } = await supabase.auth.signOut();







    if (error) {







      setLoadError(error.message);







      setSigningOut(false);







      return;







    }







    router.replace("/login");







    router.refresh();







  }







  function resetFilters() {







    setDepartmentFilter("All Departments");
    setSectionFilter("All Sections");
    setWardFilter("All Wards");







    setIssueFilter("All Issues");







    setStatusFilter("All Statuses");

    setWorkStatusFilter("All Work Statuses");







    setPriorityFilter("All Priorities");







    setPeriodFilter("All Dates");







    setSearch("");







  }







  return (







    <div className="min-h-screen bg-[#f7f9f7] text-slate-800">







      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[264px] flex-col border-r border-green-950 bg-[#14532d] shadow-[8px_0_32px_rgba(15,23,42,0.12)] lg:flex">







        <div className="relative overflow-hidden border-b border-green-100 bg-gradient-to-br from-white via-white to-green-50/90 px-4 py-4">







          <div className="pointer-events-none absolute -right-7 -top-8 h-24 w-24 rounded-full border-[12px] border-green-100/60" />







          <div className="pointer-events-none absolute right-4 top-0 h-1 w-12 rounded-b-full bg-yellow-400" />







          <div className="relative flex items-center gap-3">







            <div className="relative shrink-0">







              <div className="absolute -inset-1 rounded-[20px] bg-gradient-to-br from-yellow-300 via-green-600 to-green-900 opacity-90" />







              <div className="relative flex h-[62px] w-[62px] items-center justify-center rounded-[17px] border-2 border-white bg-white p-1.5 shadow-lg shadow-green-950/10">







                <Image src="/Emalahleni Logo.png" alt="Emalahleni Local Municipality logo" width={56} height={56} className="h-full w-full object-contain" priority />







              </div>







              <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-white bg-yellow-400" />







            </div>







            <div className="min-w-0 flex-1">







              <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-green-700">Emalahleni</p>







              <p className="mt-0.5 text-[14px] font-black leading-[1.05] tracking-[-0.035em] text-slate-900">Local Municipality</p>







              <div className="mt-2 flex items-center gap-1.5">







                <span className="h-[3px] w-7 rounded-full bg-green-800" />







                <span className="h-[3px] w-3 rounded-full bg-yellow-400" />







                <span className="truncate text-[8px] font-semibold uppercase tracking-[0.11em] text-slate-500">Serving our community</span>







              </div>







            </div>







          </div>







        </div>







        <div className="flex-1 overflow-y-auto bg-[#14532d] px-3 py-5 text-white">







          <div className="mb-3 flex items-center justify-between px-3">







            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE082]">Main menu</span>







            <span className="text-[9px] font-semibold text-white/50">01</span>







          </div>







          <nav className="space-y-1">







            {[







              { label: "Dashboard", href: "/dashboard", icon: "▦" },







              { label: "Complaints", href: "/complaints", icon: "▤" },







              { label: "Departments", href: "/departments", icon: "▥" },







              { label: "Reports", href: "/reports", icon: "▥" },







            ].map((item) => {







              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);







              return (







                <Link







                  key={item.label}







                  href={item.href}







                  aria-current={isActive ? "page" : undefined}







                  className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[11px] font-bold transition-all duration-200 ${







                    isActive







                      ? "bg-white/10 text-white shadow-sm shadow-black/10"







                      : "text-white/85 hover:bg-white/10 hover:text-white"







                  }`}







                >







                  {isActive && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-white" />}







                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[15px] transition-colors ${







                    isActive ? "text-[#FFE082]" : "text-white/70 group-hover:bg-white/15 group-hover:text-[#FFE082]"







                  }`}>







                    {item.icon}







                  </span>







                  <span>{item.label}</span>







                  {isActive && <span className="ml-auto text-sm leading-none">→</span>}







                </Link>







              );







            })}







          </nav>







          <div className="mb-3 mt-7 flex items-center justify-between px-3">







            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE082]">User Management</span>







            <span className="text-[9px] font-semibold text-white/50">02</span>







          </div>







          <nav className="space-y-1">







            {isAdministratorReport && (







              <Link







                href="/users"







                aria-current={pathname === "/users" || pathname.startsWith("/users/") ? "page" : undefined}







                className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[11px] font-bold transition-all duration-200 ${







                  pathname === "/users" || pathname.startsWith("/users/")







                    ? "bg-white/10 text-white shadow-sm shadow-black/10"







                    : "text-white/85 hover:bg-white/10 hover:text-white"







                }`}







              >







                {(pathname === "/users" || pathname.startsWith("/users/")) && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-white" />}







                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[15px] text-white/70 group-hover:text-[#FFE082]">♙</span>







                <span>Users &amp; Roles</span>







                {(pathname === "/users" || pathname.startsWith("/users/")) && <span className="ml-auto text-sm leading-none">→</span>}







              </Link>







            )}







            <Link







              href="/staff"







              aria-current={pathname === "/staff" || pathname.startsWith("/staff/") ? "page" : undefined}







              className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[11px] font-bold transition-all duration-200 ${







                pathname === "/staff" || pathname.startsWith("/staff/")







                  ? "bg-white/10 text-white shadow-sm shadow-black/10"







                  : "text-white/85 hover:bg-white/10 hover:text-white"







              }`}







            >







              {(pathname === "/staff" || pathname.startsWith("/staff/")) && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-white" />}







              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[15px] text-white/70 group-hover:text-[#FFE082]">♙</span>







              <span>Staff</span>







              {(pathname === "/staff" || pathname.startsWith("/staff/")) && <span className="ml-auto text-sm leading-none">→</span>}







            </Link>







            {isCallCentreAgentReport && (







              <Link







                href="/councillors"







                aria-current={pathname === "/councillors" || pathname.startsWith("/councillors/") ? "page" : undefined}







                className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[11px] font-bold transition-all duration-200 ${







                  pathname === "/councillors" || pathname.startsWith("/councillors/")







                    ? "bg-white/10 text-white shadow-sm shadow-black/10"







                    : "text-white/85 hover:bg-white/10 hover:text-white"







                }`}







              >







                {(pathname === "/councillors" || pathname.startsWith("/councillors/")) && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-white" />}







                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[15px] text-white/70 group-hover:text-[#FFE082]">♙</span>







                <span>Councillors</span>







                {(pathname === "/councillors" || pathname.startsWith("/councillors/")) && <span className="ml-auto text-sm leading-none">→</span>}







              </Link>







            )}







            {isAdministratorReport && (







              <Link







                href="/settings"







                aria-current={pathname === "/settings" || pathname.startsWith("/settings/") ? "page" : undefined}







                className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[11px] font-bold transition-all duration-200 ${







                  pathname === "/settings" || pathname.startsWith("/settings/")







                    ? "bg-white/10 text-white shadow-sm shadow-black/10"







                    : "text-white/85 hover:bg-white/10 hover:text-white"







                }`}







              >







                {(pathname === "/settings" || pathname.startsWith("/settings/")) && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-white" />}







                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[15px] text-white/70 group-hover:text-[#FFE082]">⚙</span>







                <span>Settings</span>







                {(pathname === "/settings" || pathname.startsWith("/settings/")) && <span className="ml-auto text-sm leading-none">→</span>}







              </Link>







            )}







          </nav>







        </div>







      </aside>







      <main className="min-h-screen pb-12 lg:ml-[264px]">







        <header className="sticky top-0 z-20 flex min-h-[88px] items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">







          <div className="min-w-0">







            <div aria-hidden="true" className="mb-2 flex items-center gap-1.5"><span className="h-[3px] w-12 rounded-full bg-yellow-400" /><span className="h-[3px] w-5 rounded-full bg-green-800/70" /></div>







            <h1 className="truncate text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">Reports &amp; Analytics</h1>







          </div>







          <button onClick={() => downloadCSV(filteredComplaints)} disabled={!filteredComplaints.length} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-green-800 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50">







            <span aria-hidden="true">↓</span> Export CSV







          </button>







        </header>







        <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-9 lg:py-8">







          {loadError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Could not load live data: {loadError}</div>}







          {loading && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">Loading reports from Supabase…</div>}







          <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#124b2b] via-[#176438] to-[#0f3922] px-6 py-7 text-white shadow-[0_18px_45px_rgba(20,83,45,0.13)] sm:px-8">







            <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full border-[34px] border-white/[0.05]" />







            <div className="pointer-events-none absolute -bottom-24 right-[24%] h-52 w-52 rounded-full border-[24px] border-yellow-300/[0.08]" />







            <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">







              <div className="max-w-2xl">







                <div aria-hidden="true" className="mb-2 flex items-center gap-1.5"><span className="h-[3px] w-12 rounded-full bg-yellow-400" /><span className="h-[3px] w-5 rounded-full bg-white/70" /></div>







                <h2 className="text-2xl font-light leading-tight tracking-tight sm:text-3xl">Turn complaint records into <span className="font-extrabold text-yellow-300">actionable insight.</span></h2>







                <p className="mt-3 max-w-xl text-sm leading-6 text-green-50/85">Review live complaint volumes, status, priority and departmental workload. Apply filters to focus the report and export the records you need.</p>







              </div>







              <div className="rounded-2xl border border-white/15 bg-white/[0.08] px-5 py-4 sm:min-w-40">







                <p className="text-xs text-green-50/80">Records in current view</p>







                <p className="mt-1 text-3xl font-extrabold">{total}</p>







                <p className="mt-1 text-[10px] text-green-50/70">{loading ? "Updating…" : "Based on current filters"}</p>







              </div>







            </div>







          </section>







          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30">







            <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">







              <div><h2 className="text-sm font-bold text-slate-800">Filter reports</h2><p className="mt-1 text-xs text-slate-500">{isSupervisorReport ? `Filters apply only to issues in ${supervisorSectionName || "your assigned section"}.` : isDepartmentReport ? `Filters apply only to ${reportScopeLabel || "your assigned department"}.` : "Filters use complaint records retrieved from the database."}</p></div>







              <button onClick={resetFilters} className="self-start text-xs font-semibold text-green-800 hover:text-green-950 sm:self-auto">Reset filters</button>







            </div>







            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">







              <div><label className="mb-1.5 block text-xs font-medium text-slate-600">Reporting period</label><select className={inputClass} value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}><option>All Dates</option><option>Last 7 Days</option><option>Last 30 Days</option><option>Last 90 Days</option></select></div>







              {!isSupervisorReport && !isDepartmentReport && <div><label className="mb-1.5 block text-xs font-medium text-slate-600">Department</label><select className={inputClass} value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}><option>All Departments</option>{departmentOptions.map((department) => <option key={department}>{department}</option>)}</select></div>}{isDepartmentReport && <div><label className="mb-1.5 block text-xs font-medium text-slate-600">Department</label><div className={`${inputClass} flex items-center bg-slate-50 font-medium text-slate-700`}>{reportScopeLabel}</div></div>}







              {isSupervisorReport && <div><label className="mb-1.5 block text-xs font-medium text-slate-600">Section issues</label><div className={`${inputClass} flex items-center bg-slate-50 font-medium text-slate-700`}>{supervisorSectionName}</div></div>}
{!isSupervisorReport && <div><label className="mb-1.5 block text-xs font-medium text-slate-600">Section</label><select className={inputClass} value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}><option>All Sections</option>{sectionOptions.map((section) => <option key={section}>{section}</option>)}</select></div>}
{!isSupervisorReport && <div><label className="mb-1.5 block text-xs font-medium text-slate-600">Ward</label><select className={inputClass} value={wardFilter} onChange={(e) => setWardFilter(e.target.value)}><option>All Wards</option>{wardOptions.map((ward) => <option key={ward} value={ward}>Ward {ward}</option>)}</select></div>}







              <div><label className="mb-1.5 block text-xs font-medium text-slate-600">Issue type</label><select className={inputClass} value={issueFilter} onChange={(e) => setIssueFilter(e.target.value)}><option>All Issues</option>{issueOptions.map((issue) => <option key={issue} value={issue}>{issue}</option>)}</select></div>







              <div><label className="mb-1.5 block text-xs font-medium text-slate-600">Complaint status</label><select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>All Statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div>







              <div><label className="mb-1.5 block text-xs font-medium text-slate-600">Work / resources status</label><select className={inputClass} value={workStatusFilter} onChange={(e) => setWorkStatusFilter(e.target.value)}><option>All Work Statuses</option>{workStatuses.map((status) => <option key={status}>{status}</option>)}</select></div>

              <div><label className="mb-1.5 block text-xs font-medium text-slate-600">Priority</label><select className={inputClass} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}><option>All Priorities</option>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></div>







              <div><label className="mb-1.5 block text-xs font-medium text-slate-600">Search</label><input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reference, subject, area…" /></div>







            </div>







          </section>







          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">







            <MetricCard label="Total complaints" value={total} note="Records matching selected filters" icon="▤" accent="bg-green-50 text-green-800" />







            <MetricCard label="Open complaints" value={open} note="Not marked resolved or closed" icon="◷" accent="bg-amber-50 text-amber-700" />







            <MetricCard label="Resolved complaints" value={resolved} note={`${resolutionRate}% of displayed records`} icon="✓" accent="bg-sky-50 text-sky-700" />







            <MetricCard label="Overdue complaints" value={overdue} note={`${critical} critical-priority records in this view`} icon="!" accent="bg-red-50 text-red-700" />

            <MetricCard label="Assigned" value={assignedCount} note="Complaints allocated to a person or team" icon="↗" accent="bg-violet-50 text-violet-700" />

            <MetricCard label="Unassigned" value={unassignedCount} note="Complaints awaiting assignment" icon="○" accent="bg-sky-50 text-sky-700" />

            <MetricCard label="Resources required" value={resourcesRequiredCount} note="Resources required or awaiting resources" icon="⚒" accent="bg-orange-50 text-orange-700" />

            <MetricCard label="Delayed work" value={delayedCount} note="Latest work update marked delayed" icon="◷" accent="bg-rose-50 text-rose-700" />







          </section>







          <section className="grid gap-5 xl:grid-cols-2">







            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30">







              <h3 className="text-sm font-bold text-[#176b55]">Complaints by status</h3><p className="mt-1 text-xs text-slate-500">Distribution of current filtered records.</p>







              <div className="mt-5 space-y-4">{statusStats.length ? statusStats.map((item) => <BarRow key={item.label} label={item.label} value={item.count} total={total} color={item.color} />) : <p className="py-5 text-sm text-slate-400">No status data available.</p>}</div>







            </div>







            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30">







              <h3 className="text-sm font-bold text-[#176b55]">Complaints by priority</h3><p className="mt-1 text-xs text-slate-500">Priority levels found in the current records.</p>







              <div className="mt-5 space-y-4">{priorityStats.length ? priorityStats.map((item) => <BarRow key={item.label} label={item.label} value={item.count} total={total} color={item.color} />) : <p className="py-5 text-sm text-slate-400">No priority data available.</p>}</div>







            </div>







          </section>







          <section className="grid gap-5 xl:grid-cols-2">

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30">

              <h3 className="text-sm font-bold text-[#176b55]">Complaints by work and resources status</h3>

              <p className="mt-1 text-xs text-slate-500">Counts use the latest recorded complaint work update.</p>

              <div className="mt-5 space-y-4">{workStatusStats.length ? workStatusStats.map((item) => <BarRow key={item.label} label={item.label} value={item.count} total={total} color={item.color} />) : <p className="py-5 text-sm text-slate-400">No work status data available.</p>}</div>

            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30">

              <h3 className="text-sm font-bold text-[#176b55]">Assignment overview</h3>

              <p className="mt-1 text-xs text-slate-500">Assigned and unassigned complaints in the current filtered view.</p>

              <div className="mt-5 space-y-4">

                <BarRow label="Assigned" value={assignedCount} total={total} color="bg-violet-500" />

                <BarRow label="Unassigned" value={unassignedCount} total={total} color="bg-sky-500" />

              </div>

            </div>

          </section>



          <section className="grid gap-5 xl:grid-cols-3">







            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/30 xl:col-span-2">







              <div className="border-b border-slate-100 px-5 py-4"><h3 className="text-sm font-bold text-[#176b55]">{isSupervisorReport ? "Section workload" : "Department workload"}</h3><p className="mt-1 text-xs text-slate-500">{isSupervisorReport ? "Complaint volumes and outstanding cases for your section only." : "Complaint volumes and outstanding cases by department."}</p></div>







              <div className="overflow-x-auto">







                <table className="w-full min-w-[650px] text-left text-xs">







                  <thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3 font-semibold">{isSupervisorReport ? "Section" : "Department"}</th><th className="px-3 py-3 text-right font-semibold">Total</th><th className="px-3 py-3 text-right font-semibold">Resolved</th><th className="px-3 py-3 text-right font-semibold">Open</th><th className="px-3 py-3 text-right font-semibold">Overdue</th><th className="px-4 py-3 font-semibold">Resolution</th></tr></thead>







                  <tbody>{departmentStats.map((item) => {







                    const rate = item.total ? Math.round((item.resolved / item.total) * 100) : 0;







                    return <tr key={item.department} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-4 py-3 font-medium text-slate-700">{item.department}</td><td className="px-3 py-3 text-right tabular-nums">{item.total}</td><td className="px-3 py-3 text-right font-semibold text-emerald-700 tabular-nums">{item.resolved}</td><td className="px-3 py-3 text-right tabular-nums">{item.open}</td><td className="px-3 py-3 text-right font-semibold text-red-600 tabular-nums">{item.overdue}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} /></div><span className="text-slate-500">{rate}%</span></div></td></tr>;







                  })}</tbody>







                </table>







                {!departmentStats.length && <p className="px-5 py-10 text-center text-sm text-slate-400">No department records are available.</p>}







              </div>







            </div>







            <div className="space-y-5">







              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30">







                <h3 className="text-sm font-bold text-[#176b55]">Resolution performance</h3><p className="mt-1 text-xs text-slate-500">Calculated from records with a resolution date.</p>







                <div className="mt-5 rounded-xl bg-green-50 p-4"><p className="text-xs text-green-800">Average resolution time</p><p className="mt-1 text-3xl font-bold text-green-950">{averageResolutionDays}<span className="ml-1 text-sm font-medium">days</span></p></div>







                <div className="mt-4 space-y-3 text-xs"><div className="flex items-center justify-between gap-3"><span className="text-slate-500">Resolution rate</span><span className="font-semibold text-slate-800">{resolutionRate}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${resolutionRate}%` }} /></div><div className="flex items-center justify-between"><span className="text-slate-500">Unresolved</span><span className="font-semibold text-slate-800">{open}</span></div><div className="flex items-center justify-between"><span className="text-slate-500">Overdue</span><span className="font-semibold text-red-600">{overdue}</span></div></div>







              </div>







              <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5"><h3 className="text-sm font-bold text-yellow-950">Follow-up</h3><p className="mt-1 text-xs leading-5 text-yellow-900">Use the current report filters to identify unresolved cases, then review the responsible department and record the outcome in the system.</p></div>







            </div>







          </section>







          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/30">

            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">

              <div><h3 className="text-sm font-bold text-[#176b55]">Community Alerts Report</h3><p className="mt-1 text-xs text-slate-500">Ward-level repeated complaint alerts and recorded community response actions, grouped by date.</p></div>

              <div className="flex items-center gap-3"><span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">{communityAlertEvents.length} event records</span><button onClick={exportCommunityAlertsCSV} disabled={!communityAlertEvents.length} className="rounded-xl border border-green-200 px-3 py-2 text-xs font-semibold text-green-800 hover:bg-green-50 disabled:opacity-50">Export alerts CSV</button></div>

            </div>

            <div className="divide-y divide-slate-100">

              {communityAlertsByDate.map(([date, events]) => {

                const isCollapsed = collapsedAlertDates.includes(date);

                return <div key={date}>

                  <button type="button" onClick={() => setCollapsedAlertDates((current) => isCollapsed ? current.filter((item) => item !== date) : [...current, date])} className="flex w-full items-center justify-between gap-3 bg-slate-50 px-5 py-3 text-left hover:bg-green-50">

                    <span className="text-xs font-bold text-slate-800">{date === "Date not recorded" ? date : new Date(`${date}T12:00:00`).toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</span><span className="flex items-center gap-3 text-xs text-slate-500"><span>{events.length} {events.length === 1 ? "event" : "events"}</span><span className="font-bold text-green-800">{isCollapsed ? "Expand +" : "Collapse −"}</span></span>

                  </button>

                  {!isCollapsed && <div className="space-y-3 p-4 sm:p-5">{events.map((event, index) => {

                    const action = String(event.action ?? "Community alert event").replaceAll("\_", " ");

                    const ward = event.ward_number ?? event.ward ?? event.ward_name ?? "Ward not recorded";

                    const count = event.complaint_count ?? event.total_complaints ?? event.number_of_complaints;

                    const detail = event.details ?? event.description ?? event.notes ?? event.message ?? "No additional details recorded.";

                    const stamp = event.created_at ?? event.event_date ?? event.alert_date;

                    return <article key={String(event.id ?? `${date}-${index}`)} className="rounded-xl border border-slate-200 bg-white p-4">

                      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-bold capitalize text-slate-900">{action}</p><p className="mt-1 text-xs text-slate-500">{ward}{count !== undefined && count !== null ? ` · ${count} linked complaints` : ""}</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold capitalize text-amber-800">{String(event.status ?? "Recorded")}</span></div>

                      <p className="mt-2 text-xs leading-5 text-slate-600">{String(detail)}</p>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400"><span>Alert key: {String(event.alert_key ?? "—")}</span><span>{stamp ? new Date(String(stamp)).toLocaleString("en-ZA") : "Time not recorded"}</span><span>Councillor notification: {event.action === "councillor_alerted" ? "Recorded" : String(event.councillor_notified ?? "Not specified")}</span></div>

                    </article>;

                  })}</div>}

                </div>;

              })}

              {!communityAlertEvents.length && <p className="px-5 py-10 text-center text-sm text-slate-500">No community alert events are currently recorded in ward_alert_events.</p>}

            </div>

            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">Showing {communityAlertEvents.length} recorded community alert events. These are separate from individual complaint records.</div>

          </section>



          <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/50 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-[#176b55]">Assistance from another department</h3>
                <p className="mt-1 text-xs text-slate-600">Cross-department support requests recorded against complaints in this report scope. These are support requests, not complaint reassignments.</p>
              </div>
              <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-[#176b55]">{departmentAssistanceRequests.length} requests</span>
            </div>
            <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
              {departmentAssistanceRequests.length ? departmentAssistanceRequests.map((row, index) => {
                const comment = String(row.comment ?? "");
                const fields = Object.fromEntries(comment.split("\n").slice(1).map((line) => {
                  const separator = line.indexOf(": ");
                  return separator < 0 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 2)];
                }));
                return (
                  <article key={row.id ?? `${row.complaint_id}-${index}`} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[#176b55]">{fields["Complaint reference"] || row.complaint_reference || "Complaint reference not recorded"}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-800">{fields["Complaint subject"] || "Subject not recorded"}</p>
                      </div>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold text-amber-800">Assistance requested</span>
                    </div>
                    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {(["Original department", "Original section", "Complainant name", "Complainant contact", "Complainant email", "Service address", "Area / suburb", "Ward", "Complaint status", "Requester department", "Requester section", "Requested department", "Requested section", "Recorded by", "Reason"] as string[]).map((label) => (
                        <div key={label} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                          <p className="break-words text-xs text-slate-800">{fields[label] || "Not recorded"}</p>
                        </div>
                      ))}
                      <div className="min-w-0 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 sm:col-span-2 lg:col-span-3">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#176b55]">Assistance required</p>
                        <p className="whitespace-pre-wrap break-words text-xs text-slate-800">{fields["Assistance required"] || "Not recorded"}</p>
                      </div>
                      <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:col-span-2 lg:col-span-3">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Complaint description</p>
                        <p className="whitespace-pre-wrap break-words text-xs text-slate-800">{fields["Complaint description"] || "Not recorded"}</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">Requested on: {row.created_at ? new Date(row.created_at).toLocaleString("en-ZA") : "Date not recorded"} · Request recorded by: {row.updated_by_name ?? row.updated_by ?? "Not recorded"}</p>
                  </article>
                );
              }) : <p className="px-5 py-10 text-center text-xs text-slate-500">No cross-department assistance requests are recorded for the current report scope.</p>}
            </div>
            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">{departmentAssistanceRequests.length} assistance request records</div>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-sm font-bold text-[#176b55]">Full operational progress history</h3>
                <p className="mt-1 text-xs text-slate-500">Every recorded operational update, including attendance, assessment, work performed, delays, resources and next actions.</p>
              </div>
              <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
                {operationalUpdates.length ? operationalUpdates.map((row, index) => (
                  <div key={row.id ?? `${row.complaint_id}-${index}`} className="space-y-2 px-5 py-4 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-green-800">{row.complaint_reference ?? "Complaint update"}</span>
                      <span className="text-slate-400">{row.created_at ? new Date(row.created_at).toLocaleString("en-ZA") : "Date not recorded"}</span>
                    </div>
                    <p className="font-semibold text-slate-800">{row.update_type ?? row.action ?? "Operational update"}</p>
                    <p className="whitespace-pre-wrap leading-5 text-slate-600">{row.message ?? row.description ?? row.notes ?? "No update message recorded."}</p>
                    <div className="grid gap-1 text-slate-500 sm:grid-cols-2">
                      <p><b>Site attended:</b> {row.site_attended ?? "Not recorded"}</p>
                      <p><b>Attended at:</b> {row.attended_at ? new Date(row.attended_at).toLocaleString("en-ZA") : "Not recorded"}</p>
                      <p><b>Assessment:</b> {row.assessment_findings ?? "Not recorded"}</p>
                      <p><b>Work performed:</b> {row.work_performed ?? "Not recorded"}</p>
                      <p><b>Resources:</b> {row.resources_needed ?? "Not recorded"}</p>
                      <p><b>Resource status:</b> {row.resource_status ?? "Not recorded"}</p>
                      <p><b>Constraint / delay:</b> {row.resource_shortage_reason ?? row.delay_reason ?? "Not recorded"}</p>
                      <p><b>Expected resources:</b> {row.expected_resources_at ? new Date(row.expected_resources_at).toLocaleString("en-ZA") : "Not recorded"}</p>
                      <p><b>Outstanding work:</b> {row.outstanding_work ?? "Not recorded"}</p>
                      <p><b>Next action:</b> {row.next_action ?? "Not recorded"}</p>
                      <p><b>Expected completion:</b> {row.expected_completion_at ? new Date(row.expected_completion_at).toLocaleString("en-ZA") : "Not recorded"}</p>
                      <p><b>Recorded by:</b> {row.created_by_name ?? row.updated_by_name ?? row.created_by ?? "Not recorded"}</p>
                    </div>
                  </div>
                )) : <p className="px-5 py-10 text-center text-xs text-slate-400">No operational updates are recorded for the current report scope.</p>}
              </div>
              <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">{operationalUpdates.length} operational update records</div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-sm font-bold text-[#176b55]">Complaint status and assignment history</h3>
                <p className="mt-1 text-xs text-slate-500">Audit trail showing status changes, assignments, reassignments, responsible officials and notes.</p>
              </div>
              <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
                {[
                  ...complaintStatusHistory.map((row) => ({...row, reportType: "Status update", reportDate: row.created_at, reportDescription: `${row.old_status ?? "—"} → ${row.new_status ?? "—"} · ${row.comment ?? ""}`, reportActor: row.updated_by_name ?? row.updated_by ?? "Not recorded"})),
                  ...assignmentHistory.map((row) => ({...row, reportType: row.action ?? "Assignment", reportDate: row.assigned_at ?? row.created_at, reportDescription: `${row.assigned_to_name ?? row.new_assignee_name ?? "Official not recorded"} · ${row.assigned_to_role ?? ""} · ${row.notes ?? ""}`, reportActor: `${row.assigned_by_name ?? "Not recorded"}${row.assigned_by_role ? ` (${row.assigned_by_role})` : ""}`})),
                ].sort((a, b) => new Date(b.reportDate ?? 0).getTime() - new Date(a.reportDate ?? 0).getTime()).map((row, index) => (
                  <div key={row.id ?? `${row.complaint_id}-${index}`} className="space-y-1 px-5 py-4 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-green-800">{row.complaint_reference ?? "Complaint"}</span>
                      <span className="text-slate-400">{row.reportDate ? new Date(row.reportDate).toLocaleString("en-ZA") : "Date not recorded"}</span>
                    </div>
                    <p className="font-semibold text-slate-800">{row.reportType}</p>
                    <p className="text-slate-600">{row.reportDescription}</p>
                    <p className="text-slate-500">Recorded by: {row.reportActor}</p>
                  </div>
                ))}
                {!complaintStatusHistory.length && !assignmentHistory.length && <p className="px-5 py-10 text-center text-xs text-slate-400">No status or assignment history is recorded for the current report scope.</p>}
              </div>
              <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">{complaintStatusHistory.length} status changes · {assignmentHistory.length} assignment records</div>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-sm font-bold text-[#176b55]">Ward response and team dispatch</h3>
                <p className="mt-1 text-xs text-slate-500">Bulk team assignments and recorded follow-up calls for community alerts.</p>
              </div>
              <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
                {wardTeamAssignments.map((row, index) => (
                  <div key={row.id ?? index} className="space-y-1 px-5 py-4 text-xs">
                    <p className="font-bold text-green-800">Ward {row.ward ?? row.ward_number ?? "—"} · {row.status ?? "Dispatched"}</p>
                    <p className="text-slate-700">Team: {Array.isArray(row.team_member_names) ? row.team_member_names.join(", ") : row.team_member_names ?? "Not recorded"}</p>
                    <p className="text-slate-500">Dispatched by: {row.assigned_by_name ?? "Not recorded"} · {row.created_at ? new Date(row.created_at).toLocaleString("en-ZA") : "Date not recorded"}</p>
                    <p className="text-slate-500">Instructions: {row.instructions ?? "Not recorded"}</p>
                  </div>
                ))}
                {wardFollowUps.map((row, index) => (
                  <div key={row.id ?? `follow-${index}`} className="space-y-1 bg-slate-50/70 px-5 py-4 text-xs">
                    <p className="font-bold text-slate-800">Ward {row.ward ?? "—"} · Follow-up call</p>
                    <p className="text-slate-600">{row.call_update ?? "No follow-up notes recorded."}</p>
                    <p className="text-slate-500">Recorded by: {row.recorded_by_name ?? row.recorded_by ?? "Not recorded"} · {row.created_at ? new Date(row.created_at).toLocaleString("en-ZA") : "Date not recorded"}</p>
                  </div>
                ))}
                {!wardTeamAssignments.length && !wardFollowUps.length && <p className="px-5 py-10 text-center text-xs text-slate-400">No ward dispatch or follow-up records are available.</p>}
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-sm font-bold text-[#176b55]">Municipal staff and shift availability</h3>
                <p className="mt-1 text-xs text-slate-500">Staff directory, section allocation, duty type and standby availability recorded on the Dashboard.</p>
              </div>
              <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
                {staffDirectory.map((person, index) => (
                  <div key={person.id ?? index} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-800">{person.full_name ?? "Name not recorded"}</p>
                      <p className="mt-1 text-slate-500">{person.designation ?? "Designation not recorded"} · {person.department_name ?? person.department ?? "Department not recorded"} / {person.section_name ?? person.section ?? "Section not recorded"}</p>
                      <p className="mt-1 text-slate-400">{person.email ?? "Email not recorded"} · {person.contact_number ?? "Contact not recorded"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-800">{person.duty_type ?? person.shift_type ?? "Duty not recorded"}</p>
                      <p className={person.standby_available ? "mt-1 font-semibold text-emerald-700" : "mt-1 text-slate-400"}>{person.standby_available ? "Standby available" : "Not on standby"}</p>
                    </div>
                  </div>
                ))}
                {!staffDirectory.length && <p className="px-5 py-10 text-center text-xs text-slate-400">No staff directory records are available for this report scope.</p>}
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-sm font-bold text-[#176b55]">Complaint deletion audit</h3>
                <p className="mt-1 text-xs text-slate-500">Audit records for complaints removed from the active register.</p>
              </div>
              <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
                {deletionActivities.map((row, index) => (
                  <div key={row.id ?? index} className="px-5 py-4 text-xs">
                    <p className="font-bold text-slate-800">{row.complaint_reference ?? "Reference not recorded"} · {row.complaint_subject ?? "Complaint deleted"}</p>
                    <p className="mt-1 text-slate-500">Deleted by: {row.deleted_by_name ?? row.deleted_by ?? "Not recorded"} · {row.deleted_at ? new Date(row.deleted_at).toLocaleString("en-ZA") : "Date not recorded"}</p>
                  </div>
                ))}
                {!deletionActivities.length && <p className="px-5 py-10 text-center text-xs text-slate-400">No deletion audit records are available.</p>}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/30">







            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center"><div><h3 className="text-sm font-bold text-[#176b55]">Complaint report register</h3><p className="mt-1 text-xs text-slate-500">Filtered live records included in the CSV export.</p></div><button onClick={() => downloadCSV(filteredComplaints)} disabled={!filteredComplaints.length} className="rounded-xl border border-green-200 px-3 py-2 text-xs font-semibold text-green-800 transition hover:bg-green-50 disabled:opacity-50">Export displayed records</button></div>







            <div className="overflow-x-auto">







              <table className="w-full min-w-[1500px] text-left text-xs">







                <thead className="bg-slate-50 text-slate-500"><tr><th className="px-5 py-3 font-semibold">Reference</th><th className="px-4 py-3 font-semibold">Complainant / complaint</th><th className="px-4 py-3 font-semibold">Contact</th><th className="px-4 py-3 font-semibold">Department</th><th className="px-4 py-3 font-semibold">Section</th><th className="px-4 py-3 font-semibold">Ward</th><th className="px-4 py-3 font-semibold">Area / address</th><th className="px-4 py-3 font-semibold">Description</th><th className="px-4 py-3 font-semibold">Priority</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Assignment</th><th className="px-4 py-3 font-semibold">Work / resources</th><th className="px-4 py-3 font-semibold">Date reported</th><th className="px-4 py-3 font-semibold">Date resolved</th></tr></thead>







                <tbody>{filteredComplaints.map((item) => <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="whitespace-nowrap px-5 py-3 font-semibold text-green-800">{item.id || "—"}</td><td className="max-w-60 px-4 py-3"><p className="font-medium text-slate-800">{item.raw?.complainant_name ?? item.raw?.customer_name ?? item.raw?.reporter_name ?? "Not recorded"}</p><p className="mt-1 text-slate-500">{item.subject}</p></td><td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.raw?.contact_number ?? item.raw?.phone_number ?? item.raw?.customer_phone ?? "—"}</td><td className="px-4 py-3 text-slate-600">{item.department || "—"}</td><td className="px-4 py-3 text-slate-600">{item.section || "—"}</td><td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.raw?.ward_number ?? item.raw?.ward ?? "—"}</td><td className="max-w-60 px-4 py-3 text-slate-600">{item.raw?.street_address ?? item.raw?.address ?? item.area ?? "—"}</td><td className="max-w-72 px-4 py-3 text-slate-600">{item.raw?.description ?? item.raw?.complaint_description ?? item.raw?.details ?? "—"}</td><td className={`whitespace-nowrap px-4 py-3 font-semibold ${priorityStyles[item.priority] ?? "text-slate-600"}`}>{item.priority}</td><td className="whitespace-nowrap px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyles[item.status] ?? "bg-slate-100 text-slate-700"}`}>{item.status}</span></td><td className="whitespace-nowrap px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.assignmentStatus === "Assigned" ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700"}`}>{item.assignmentStatus}</span></td><td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.workStatus || "Not recorded"}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500">{item.dateReported || "—"}</td><td className="whitespace-nowrap px-4 py-3 text-slate-500">{item.dateResolved || "—"}</td></tr>)}</tbody>







              </table>







              {!loading && filteredComplaints.length === 0 && <div className="px-5 py-12 text-center"><p className="text-sm font-semibold text-slate-700">No complaint records found</p><p className="mt-1 text-xs text-slate-400">{complaints.length ? "Try changing or resetting your filters." : "Complaints will appear here when records are available in the database."}</p></div>}







            </div>







            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">Showing {filteredComplaints.length} of {complaints.length} live records</div>







          </section>







          <footer className="border-t border-slate-200 py-5 text-center text-xs text-slate-400">Emalahleni Local Municipality · Complaints Management System</footer>







        </div>







      </main>







    </div>







  );







}
