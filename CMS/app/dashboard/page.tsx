"use client";
import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
type IconName =
  | "dashboard"
  | "complaints"
  | "requests"
  | "departments"
  | "reports"
  | "users"
  | "settings"
  | "menu"
  | "close"
  | "arrow"
  | "plus"
  | "calendar"
  | "bell"
  | "check"
  | "activity"
  | "clock"
  | "building"
  | "list";
type ComplaintStatus = "New" | "Received" | "Assigned" | "In Progress" | "In Process" | "Completed" | "Resolved";
type ComplaintPriority = "Low" | "Medium" | "High" | "Critical";
type Complaint = {
  id: string;
  reference: string;
  subject: string;
  department: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  date: string;
  raw: DatabaseRow;
};
type Department = {
  name: string;
  complaints: number;
};
type Activity = {
  title: string;
  description: string;
  time: string;
  timestamp: number;
  complaintId?: string;
};
type DatabaseRow = Record<string, unknown>;

// Email delivery is intentionally reported as not configured until the project
// has an email provider and a server-side notification endpoint.
async function notifyComplainants({
  event,
  ids,
}: {
  event: "resolved";
  ids: string[];
}): Promise<{ ok: boolean; message: string }> {
  void event;
  void ids;
  return {
    ok: false,
    message:
      "Complaint status was saved, but complainant email notifications are not configured. Connect an email provider and notification API to enable delivery.",
  };
}

function groupActivitiesByDate(items: Activity[]): { key: string; label: string; activities: Activity[] }[] {
  const groups = new Map<string, Activity[]>();
  for (const activity of items) {
    const parsed = activity.timestamp ? new Date(activity.timestamp) : null;
    const valid = parsed && !Number.isNaN(parsed.getTime());
    const key = valid
      ? `${parsed!.getFullYear()}-${String(parsed!.getMonth() + 1).padStart(2, "0")}-${String(parsed!.getDate()).padStart(2, "0")}`
      : "undated";
    const current = groups.get(key) || [];
    current.push(activity);
    groups.set(key, current);
  }
  return Array.from(groups.entries()).map(([key, activities]) => ({
    key,
    label: key === "undated"
      ? "Date not recorded"
      : new Date(`${key}T12:00:00`).toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
    activities: activities.sort((a, b) => b.timestamp - a.timestamp),
  })).sort((a, b) => {
    if (a.key === "undated") return 1;
    if (b.key === "undated") return -1;
    return b.key.localeCompare(a.key);
  });
}

function groupComplaintsByDate(items: Complaint[]): { key: string; label: string; complaints: Complaint[] }[] {
  const groups = new Map<string, Complaint[]>();
  for (const complaint of items) {
    const parsed = complaint.date ? new Date(complaint.date) : null;
    const valid = parsed && !Number.isNaN(parsed.getTime());
    const key = valid ? `${parsed!.getFullYear()}-${String(parsed!.getMonth() + 1).padStart(2, "0")}-${String(parsed!.getDate()).padStart(2, "0")}` : "undated";
    const current = groups.get(key) || [];
    current.push(complaint);
    groups.set(key, current);
  }
  return Array.from(groups.entries()).map(([key, complaints]) => ({
    key,
    label: key === "undated" ? "Date not recorded" : new Date(`${key}T12:00:00`).toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
    complaints: complaints.sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      return timeB - timeA;
    }),
  })).sort((a, b) => {
    if (a.key === "undated") return 1;
    if (b.key === "undated") return -1;
    return b.key.localeCompare(a.key);
  });
}

// Keep redirect choices identical to the Complaint Capture page catalogue.
const REDIRECT_DEPARTMENTS = [
  "Technical Services",
  "Finance",
  "Corporate Services",
  "Development Planning",
  "Community Services",
  "Environmental & Waste Management",
];

const REDIRECT_COMPLAINT_SUBJECTS = [

  // BURSARIES AND YOUTH DEVELOPMENT — confirmed database routing
  { subject: "Municipal bursary application enquiry", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Bursary application status or delayed feedback", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Bursary eligibility or required documents enquiry", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Bursary award, payment or renewal enquiry", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Bursary application or selection process complaint", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Youth development or training programme enquiry", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Municipal vacancy or recruitment advert enquiry", department: "Corporate Services", section: "Human Resources" },
  { subject: "Job application submission or acknowledgement issue", department: "Corporate Services", section: "Human Resources" },
  { subject: "Recruitment application status or delayed feedback", department: "Corporate Services", section: "Human Resources" },
  { subject: "Recruitment process or shortlisting complaint", department: "Corporate Services", section: "Human Resources" },
  { subject: "Recruitment advert or application deadline concern", department: "Corporate Services", section: "Human Resources" },
  { subject: "Other bursary or youth training enquiry", department: "Corporate Services", section: "Youth Development and Training" },
  { subject: "Other recruitment or vacancy enquiry", department: "Corporate Services", section: "Human Resources" },

  { subject: "Incorrect municipal account or bill", department: "Finance", section: "Billing" },
  { subject: "Unexpectedly high water charges", department: "Finance", section: "Billing" },
  { subject: "Unexpectedly high electricity charges", department: "Finance", section: "Billing" },
  { subject: "Meter reading dispute", department: "Finance", section: "Metering & Billing" },
  { subject: "Estimated or missing meter reading", department: "Finance", section: "Metering & Billing" },
  { subject: "Water account query", department: "Finance", section: "Billing" },
  { subject: "Electricity account query", department: "Finance", section: "Billing" },
  { subject: "Incorrect property rates or valuation", department: "Finance", section: "Property Rates" },
  { subject: "Property valuation objection or enquiry", department: "Finance", section: "Property Rates" },
  { subject: "Payment not reflected on account", department: "Finance", section: "Payments & Receipts" },
  { subject: "Incorrect account balance", department: "Finance", section: "Payments & Receipts" },
  { subject: "Refund query or delayed refund", department: "Finance", section: "Payments & Receipts" },
  { subject: "Disconnection or restriction dispute", department: "Finance", section: "Credit Control" },
  { subject: "Municipal debt or payment arrangement enquiry", department: "Finance", section: "Credit Control" },
  { subject: "Other municipal account or billing issue", department: "Finance", section: "Other" },

  
  // TECHNICAL SERVICES — approved sections and complaint subjects
  // ELECTRICAL
  { subject: "Power outage", department: "Technical Services", section: "Electrical" },
  { subject: "Partial power outage", department: "Technical Services", section: "Electrical" },
  { subject: "Frequent power interruptions", department: "Technical Services", section: "Electrical" },
  { subject: "Low voltage", department: "Technical Services", section: "Electrical" },
  { subject: "High voltage", department: "Technical Services", section: "Electrical" },
  { subject: "Electricity meter fault", department: "Technical Services", section: "Electrical" },
  { subject: "Faulty electricity connection", department: "Technical Services", section: "Electrical" },
  { subject: "Damaged electrical cable", department: "Technical Services", section: "Electrical" },
  { subject: "Exposed electrical wires", department: "Technical Services", section: "Electrical" },
  { subject: "Sparking electrical equipment", department: "Technical Services", section: "Electrical" },
  { subject: "Damaged electrical pole", department: "Technical Services", section: "Electrical" },
  { subject: "Transformer fault", department: "Technical Services", section: "Electrical" },
  { subject: "Illegal electricity connection", department: "Technical Services", section: "Electrical" },
  { subject: "Streetlight not working", department: "Technical Services", section: "Electrical" },
  { subject: "Damaged streetlight", department: "Technical Services", section: "Electrical" },
  { subject: "Electrical infrastructure vandalism", department: "Technical Services", section: "Electrical" },
  { subject: "Other", department: "Technical Services", section: "Electrical" },

  // WATER SUPPLY
  { subject: "No water supply", department: "Technical Services", section: "Water Supply" },
  { subject: "Low water pressure", department: "Technical Services", section: "Water Supply" },
  { subject: "Water leakage", department: "Technical Services", section: "Water Supply" },
  { subject: "Burst water pipe", department: "Technical Services", section: "Water Supply" },
  { subject: "Damaged water connection", department: "Technical Services", section: "Water Supply" },
  { subject: "Water meter fault", department: "Technical Services", section: "Water Supply" },
  { subject: "Water meter leakage", department: "Technical Services", section: "Water Supply" },
  { subject: "Discoloured water", department: "Technical Services", section: "Water Supply" },
  { subject: "Water with an unusual smell or taste", department: "Technical Services", section: "Water Supply" },
  { subject: "Intermittent water supply", department: "Technical Services", section: "Water Supply" },
  { subject: "Water tanker request", department: "Technical Services", section: "Water Supply" },
  { subject: "Water infrastructure vandalism", department: "Technical Services", section: "Water Supply" },
  { subject: "Other", department: "Technical Services", section: "Water Supply" },

  // SANITATION AND SEWERAGE
  { subject: "Sewer blockage", department: "Technical Services", section: "Sanitation and Sewerage" },
  { subject: "Sewer overflow", department: "Technical Services", section: "Sanitation and Sewerage" },
  { subject: "Burst sewer pipe", department: "Technical Services", section: "Sanitation and Sewerage" },
  { subject: "Sewer manhole overflowing", department: "Technical Services", section: "Sanitation and Sewerage" },
  { subject: "Missing manhole cover", department: "Technical Services", section: "Sanitation and Sewerage" },
  { subject: "Damaged manhole", department: "Technical Services", section: "Sanitation and Sewerage" },
  { subject: "Sewer smell", department: "Technical Services", section: "Sanitation and Sewerage" },
  { subject: "Wastewater leakage", department: "Technical Services", section: "Sanitation and Sewerage" },
  { subject: "Blocked municipal sewer connection", department: "Technical Services", section: "Sanitation and Sewerage" },
  { subject: "Sewage spill on public road", department: "Technical Services", section: "Sanitation and Sewerage" },
  { subject: "Sewer infrastructure vandalism", department: "Technical Services", section: "Sanitation and Sewerage" },
  { subject: "Other", department: "Technical Services", section: "Sanitation and Sewerage" },

  // ROADS AND STORMWATER
  { subject: "Potholes", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Damaged road surface", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Road collapse", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Damaged gravel road", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Road erosion", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Blocked stormwater drain", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Damaged stormwater drain", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Stormwater pipe blockage", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Flooding during rainfall", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Damaged culvert", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Damaged bridge", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Roadside drainage problem", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Missing or damaged road signs", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Damaged speed hump", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Damaged kerbing", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Road infrastructure vandalism", department: "Technical Services", section: "Roads and Stormwater" },
  { subject: "Other", department: "Technical Services", section: "Roads and Stormwater" },

  // DEVELOPMENT PLANNING — land use and building control affecting residents
  { subject: "Building work without approved plans", department: "Development Planning", section: "Building Control" },
  { subject: "Unsafe building or structural concern", department: "Development Planning", section: "Building Control" },
  { subject: "Building plan approval enquiry or delay", department: "Development Planning", section: "Building Control" },
  { subject: "Illegal land use or zoning concern", department: "Development Planning", section: "Land Use Management" },
  { subject: "Unauthorised change of property use", department: "Development Planning", section: "Land Use Management" },
  { subject: "Property development or subdivision enquiry", department: "Development Planning", section: "Town Planning" },
  { subject: "Development affecting neighbouring property", department: "Development Planning", section: "Town Planning" },
  { subject: "Other land use or building control issue", department: "Development Planning", section: "Other" },

  // COMMUNITY SERVICES — recreation, public facilities, traffic and municipal law enforcement
  { subject: "Damaged municipal park or playground", department: "Community Services", section: "Parks & Recreation" },
  { subject: "Overgrown grass or vegetation in public park", department: "Community Services", section: "Parks & Recreation" },
  { subject: "Damaged playground equipment", department: "Community Services", section: "Parks & Recreation" },
  { subject: "Damaged community hall or public facility", department: "Community Services", section: "Community Facilities" },
  { subject: "Community facility maintenance problem", department: "Community Services", section: "Community Facilities" },
  { subject: "Cemetery maintenance or cleanliness problem", department: "Community Services", section: "Cemeteries" },
  { subject: "Cemetery booking or burial service enquiry", department: "Community Services", section: "Cemeteries" },
  { subject: "Library service or facility complaint", department: "Community Services", section: "Libraries" },
  { subject: "Sport field or recreation facility damaged", department: "Community Services", section: "Sport & Recreation" },
  { subject: "Faulty traffic signal or traffic light", department: "Community Services", section: "Traffic Department" },
  { subject: "Traffic sign damaged, missing or obscured", department: "Community Services", section: "Traffic Department" },
  { subject: "Road traffic obstruction or unsafe traffic condition", department: "Community Services", section: "Traffic Department" },
  { subject: "Traffic officer conduct or service complaint", department: "Community Services", section: "Traffic Department" },
  { subject: "Traffic-related municipal service enquiry", department: "Community Services", section: "Traffic Department" },
  { subject: "Illegal trading or trading without a permit", department: "Community Services", section: "Law Enforcement" },
  { subject: "Municipal by-law violation", department: "Community Services", section: "Law Enforcement" },
  { subject: "Obstruction of a pavement or public space", department: "Community Services", section: "Law Enforcement" },
  { subject: "Public nuisance or unlawful activity affecting public spaces", department: "Community Services", section: "Law Enforcement" },
  { subject: "Law enforcement officer conduct or service complaint", department: "Community Services", section: "Law Enforcement" },
  { subject: "Other community, traffic or law-enforcement issue", department: "Community Services", section: "Other" },

  // ENVIRONMENTAL MANAGEMENT & WASTE — refuse, dumping and environmental health
  { subject: "Missed household refuse collection", department: "Environmental & Waste Management", section: "Waste Management" },
  { subject: "Refuse collection schedule not followed", department: "Environmental & Waste Management", section: "Waste Management" },
  { subject: "Waste left behind after collection", department: "Environmental & Waste Management", section: "Waste Management" },
  { subject: "Illegal dumping on public land", department: "Environmental & Waste Management", section: "Waste Management" },
  { subject: "Overflowing communal refuse point", department: "Environmental & Waste Management", section: "Waste Management" },
  { subject: "Illegal burning of waste", department: "Environmental & Waste Management", section: "Waste Management" },
  { subject: "Environmental pollution or public nuisance", department: "Environmental & Waste Management", section: "Environmental Management & Compliance" },
  { subject: "Overgrown or neglected property affecting the public", department: "Environmental & Waste Management", section: "Environmental Management & Compliance" },
  { subject: "Unhygienic premises or suspected public health hazard", department: "Environmental & Waste Management", section: "Environmental Management & Compliance" },
  { subject: "Pest or rodent concern linked to unsanitary conditions", department: "Environmental & Waste Management", section: "Environmental Management & Compliance" },
  { subject: "Air pollution, smoke or dust nuisance", department: "Environmental & Waste Management", section: "Environmental Management & Compliance" },
  { subject: "Environmental by-law non-compliance", department: "Environmental & Waste Management", section: "Environmental Management & Compliance" },
  { subject: "Noise complaint", department: "Environmental & Waste Management", section: "Environmental Management & Compliance" },
  { subject: "Excessive noise from a residential or business property", department: "Environmental & Waste Management", section: "Environmental Management & Compliance" },
  { subject: "Noise from construction, events or loud music", department: "Environmental & Waste Management", section: "Environmental Management & Compliance" },
  { subject: "Other waste or environmental issue", department: "Environmental & Waste Management", section: "Environmental Management & Compliance" },
];

const REDIRECT_SECTIONS_BY_DEPARTMENT: Record<string, string[]> = {
  "Corporate Services": [
    "Youth Development and Training",
    "Human Resources",
  ],
  Finance: [
    "Billing",
    "Metering & Billing",
    "Property Rates",
    "Payments & Receipts",
    "Credit Control",
    "Other",
  ],
  "Technical Services": [
    "Electrical",
    "Water Supply",
    "Sanitation and Sewerage",
    "Roads and Stormwater",
  ],
  "Development Planning": [
    "Building Control",
    "Land Use Management",
    "Town Planning",
    "Other",
  ],
  "Community Services": [
    "Social and Community Development",
    "Parks & Recreation",
    "Community Facilities",
    "Cemeteries",
    "Libraries",
    "Sport & Recreation",
    "Traffic Department",
    "Law Enforcement",
    "Other",
  ],
  "Environmental & Waste Management": [
    "Waste Management",
    "Environmental Management & Compliance",
    "Parks, Cemeteries & Open Space Management",
    "Other",
  ],
};


      const REDIRECT_DEPARTMENT_ALIASES: Record<string, string[]> = {
        "Environmental & Waste Management": ["Environmental and Waste", "Environmental & Waste Management", "Environmental and Waste Management"],
      };
      const REDIRECT_SECTION_ALIASES: Record<string, string[]> = {
        "Electrical": ["Electrical Services", "Electricity"],
        "Water Supply": ["Water Services", "Water Infrastructure"],
        "Sanitation and Sewerage": ["Sanitation Services", "Sewer Infrastructure"],
        "Roads and Stormwater": ["Roads Maintenance", "Roads and Road Maintenance", "Stormwater Drainage", "Stormwater and Drainage"],
        "Parks & Recreation": ["Parks and Public Open Spaces", "Sports and Recreation"],
        "Sport & Recreation": ["Sports and Recreation"],
        "Cemeteries": ["Cemeteries"],
        "Libraries": ["Libraries"],
        "Environmental Management & Compliance": ["Environmental Health", "Pest and Nuisance Control"],
        "Parks, Cemeteries & Open Space Management": ["Parks and Public Open Spaces", "Cemeteries"],
      };
      const REDIRECT_SUBJECT_SECTION_ALIASES: Record<string, string[]> = {
        "Illegal dumping": ["Illegal Dumping"],
        "Refuse collection schedule not followed": ["Waste Removal Complaints", "Solid Waste Collection"],
        "No water supply": ["Water Infrastructure"],
        "Sewer overflow or sewage spill": ["Sewer Infrastructure"],
        "Job application submission or acknowledgement issue": ["Human Resources"],
      };

function normalizeComplaintRouteName(value: string): string {
  return value.toLowerCase().replace(/&/g, "and").replace(/\bhr\b/g, "human resources").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function parseDashboardDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  let parsed: Date;
  if (typeof value === "number" || (typeof value === "string" && /^\d{9,13}$/.test(value.trim()))) {
    const numeric = Number(value);
    // Supabase timestamps are normally ISO strings, but some legacy fields store
    // Unix seconds. Convert seconds to milliseconds before creating the Date.
    parsed = new Date(numeric < 100000000000 ? numeric * 1000 : numeric);
  } else {
    parsed = new Date(String(value));
  }
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function complaintDashboardDate(row: DatabaseRow): Date | null {
  const createdAt = parseDashboardDate(row.created_at ?? row.created_on ?? row.submitted_at);
  const reportedAt = parseDashboardDate(row.date_reported ?? row.reported_at ?? row.date);
  // The dashboard register is grouped by when the complaint entered the system.
  // Prefer created_at so a complaint captured today appears under today's date,
  // even if its reported-date field contains an old/default value (such as 1970).
  return createdAt || reportedAt;
}

function firstText(row: DatabaseRow, keys: string[], fallback: string = ""): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as DatabaseRow;
      const nestedName: string = firstText(nested, ["name", "title", "department_name", "full_name"]);
      if (nestedName) return nestedName;
    }
  }
  return fallback;
}
function normalizeStatus(value: string): ComplaintStatus {
  const status = value.trim().toLowerCase().replace(/[_*-]+/g, " ");
  if (["new", "open", "received", "submitted", "logged"].includes(status)) return "New";
  if (["assigned", "allocated", "dispatched"].includes(status)) return "Assigned";
  if (["in progress", "inprogress", "in process", "processing", "ongoing", "underway"].includes(status)) return "In Progress";
  if (["resolved", "closed", "completed", "complete"].includes(status)) return "Resolved";
  if (["escalated", "escalation", "pending"].includes(status)) return "In Progress";
  return "New";
}

function statusForOperationalUpdate(updateType: string): ComplaintStatus {
  const type = updateType.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (type === "received") return "New";
  if (type === "will attend") return "New";
  if (["assessing situation", "work in progress", "delayed", "resources required", "awaiting resources"].includes(type)) return "In Progress";
  if (type === "work completed" || type === "unable to resolve") return "Resolved";
  if (type === "escalated") return "Resolved";
  return "New";
}
function normalizePriority(value: string): ComplaintPriority {
  const priority = value.trim().toLowerCase();
  if (priority === "low") return "Low";
  if (["high", "urgent"].includes(priority)) return "High";
  if (["critical", "emergency"].includes(priority)) return "Critical";
  return "Medium";
}
function normalizePagePermission(value: unknown): string {
  const page = String(value ?? "").trim().toLowerCase().replace(/[ _-]+/g, " ");
  const knownPages: Record<string, string> = {
    dashboard: "Dashboard",
    complaints: "Complaints",
    complaint: "Complaints",
    departments: "Departments",
    department: "Departments",
    reports: "Reports",
    report: "Reports",
    "users & roles": "Users & Roles",
    "users and roles": "Users & Roles",
    settings: "Settings",
  };
  return knownPages[page] || String(value ?? "").trim();
}

function normalizePageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((page): page is string => typeof page === "string")
    .map(normalizePagePermission)
    .filter(Boolean)));
}

function normalizeAlertKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function getComplaintArea(row: DatabaseRow): string {
  return firstText(row, ["area", "service_area", "suburb", "township", "community", "location_area", "place_name", "location"]);
}
function getComplaintWard(row: DatabaseRow): string {
  const ward = firstText(row, ["ward", "ward_number", "ward_no", "ward_name", "ward_id"]);
  // Database values may already include the word "Ward" (sometimes twice).
  // UI labels add "Ward" themselves, so keep only the ward identifier here.
  return ward.replace(/^(?:\s*ward[\s#:-]*)+/i, "").trim();
}
function getComplaintIssue(row: DatabaseRow, subject: string): string {
  return firstText(row, ["issue_type", "complaint_type", "category", "complaint_category", "service_type", "issue", "problem_type"], subject);
}
const mainNavigation: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/complaints", label: "Complaints", icon: "complaints" },
  { href: "/departments", label: "Departments", icon: "departments" },
  { href: "/reports", label: "Reports", icon: "reports" },
];
// Administrator navigation under USER MANAGEMENT.
const adminNavigation: { href: string; label: string; icon: IconName }[] = [
  { href: "/users", label: "Users & Roles", icon: "users" },
  { href: "/staff", label: "Staff", icon: "users" },
  { href: "/councillors", label: "Councillors", icon: "users" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

// Call Centre Agents can view Staff and Councillors.
const callCentreManagementNavigation: { href: string; label: string; icon: IconName }[] = [
  { href: "/staff", label: "Staff", icon: "users" },
  { href: "/councillors", label: "Councillors", icon: "users" },
];

// Supervisors and Clerks can view Staff only.
const supervisorManagementNavigation: { href: string; label: string; icon: IconName }[] = [
  { href: "/staff", label: "Staff", icon: "users" },
];

export default function DashboardPage() {
  const [allowedPages, setAllowedPages] = useState<string[]>(["Dashboard"]);
  const [isAdministratorAccount, setIsAdministratorAccount] = useState(false);
  const [isSupervisorAccount, setIsSupervisorAccount] = useState(false);
  const [isCallCentreAgentAccount, setIsCallCentreAgentAccount] = useState(false);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggedInName, setLoggedInName] = useState("Loading user...");
  const [loggedInEmail, setLoggedInEmail] = useState("");
  const [loggedInRole, setLoggedInRole] = useState("");
  const [loggedInDepartmentId, setLoggedInDepartmentId] = useState("");
  const [loggedInDepartmentName, setLoggedInDepartmentName] = useState("");
  const [loggedInSectionId, setLoggedInSectionId] = useState("");
  const [loggedInSectionName, setLoggedInSectionName] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [bulkTeamDispatches, setBulkTeamDispatches] = useState<DatabaseRow[]>([]);
  const [assignmentByComplaint, setAssignmentByComplaint] = useState<Record<string, DatabaseRow>>({});
  const [routingByComplaint, setRoutingByComplaint] = useState<Record<string, DatabaseRow[]>>({});
  const [eligibleRoutingUsers, setEligibleRoutingUsers] = useState<DatabaseRow[]>([]);
  const [routingMode, setRoutingMode] = useState<"both" | "supervisor" | "clerk">("both");
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("");
  const [selectedClerkId, setSelectedClerkId] = useState("");
  const [routingNotesInput, setRoutingNotesInput] = useState("");
  const [routingLoading, setRoutingLoading] = useState(false);
  const [savingRouting, setSavingRouting] = useState(false);
  const [routingNotice, setRoutingNotice] = useState("");
  const [routingError, setRoutingError] = useState("");
  const [eligibleOfficials, setEligibleOfficials] = useState<DatabaseRow[]>([]);
  const [bulkStaffLoading, setBulkStaffLoading] = useState(false);
  const [bulkStaffLoadError, setBulkStaffLoadError] = useState("");
  const [selectedOfficialId, setSelectedOfficialId] = useState("");
  const [assignmentNotesInput, setAssignmentNotesInput] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [assignmentNotice, setAssignmentNotice] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [complaintSearch, setComplaintSearch] = useState("");
  const [complaintStatusFilter, setComplaintStatusFilter] = useState("All");
  const [collapsedDateGroups, setCollapsedDateGroups] = useState<Record<string, boolean>>({});
  const [showCommunityAlerts, setShowCommunityAlerts] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [complaintAction, setComplaintAction] = useState<"view" | "edit" | null>(null);
  const [expandedComplaintPanels, setExpandedComplaintPanels] = useState<Record<string, boolean>>({});
  const [expandedBulkAlertPanels, setExpandedBulkAlertPanels] = useState<Record<string, boolean>>({});
  const [expandedBulkResourcePanels, setExpandedBulkResourcePanels] = useState<Record<string, boolean>>({});
  const [staffAssignmentExpanded, setStaffAssignmentExpanded] = useState(false);
  const [complaintInformationExpanded, setComplaintInformationExpanded] = useState(false);
  const [complaintAssignmentExpanded, setComplaintAssignmentExpanded] = useState(false);
  const [staffAssignmentLoading, setStaffAssignmentLoading] = useState(false);

  // Every newly opened complaint starts with all detail panels collapsed.
  useEffect(() => {
    if (!selectedComplaint?.id) return;
    setStaffAssignmentExpanded(false);
    setComplaintInformationExpanded(false);
    setComplaintAssignmentExpanded(false);
    setExpandedComplaintPanels({});
  }, [selectedComplaint?.id]);
  const [savingComplaint, setSavingComplaint] = useState(false);
  const [deletingComplaintId, setDeletingComplaintId] = useState<string | null>(null);
  const [complaintActionError, setComplaintActionError] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [editStatus, setEditStatus] = useState<ComplaintStatus>("New");
  // Operational update fields: authorised Call Centre Agents, Supervisors and Clerks record complaint progress.
  const [operationalUpdates, setOperationalUpdates] = useState<DatabaseRow[]>([]);
  const [allComplaintWorkUpdates, setAllComplaintWorkUpdates] = useState<DatabaseRow[]>([]);
  const [operationalUpdatesLoading, setOperationalUpdatesLoading] = useState(false);
  const [savingOperationalUpdate, setSavingOperationalUpdate] = useState(false);
  const [operationalUpdateNotice, setOperationalUpdateNotice] = useState("");
  const [operationalUpdateType, setOperationalUpdateType] = useState("Received");
  const [operationalUpdateStatus, setOperationalUpdateStatus] = useState<ComplaintStatus>("Assigned");
  // Cross-department complaint redirection uses the same live routing catalogue
  // as complaint capture: department, section and complaint-subject catalogues.
  const [departmentRoutingExpanded, setDepartmentRoutingExpanded] = useState(false);
  const [redirectDepartmentName, setRedirectDepartmentName] = useState("");
  const [redirectSectionName, setRedirectSectionName] = useState("");
  const [redirectSubject, setRedirectSubject] = useState("");
  const [redirectOtherSubject, setRedirectOtherSubject] = useState("");
  const [redirectOptionsLoading, setRedirectOptionsLoading] = useState(false);
  const [redirectSaving, setRedirectSaving] = useState(false);
  const [redirectNotice, setRedirectNotice] = useState("");
  const [redirectError, setRedirectError] = useState("");
  const [officialFeedbackName, setOfficialFeedbackName] = useState("");
  const [officialFeedbackDesignation, setOfficialFeedbackDesignation] = useState("");
  const [officialFeedbackContactedAt, setOfficialFeedbackContactedAt] = useState("");
  const [operationalMessage, setOperationalMessage] = useState("");
  const [resourceAvailability, setResourceAvailability] = useState("Not assessed");
  const [resourcesNeeded, setResourcesNeeded] = useState("");
  const [resourceShortageReason, setResourceShortageReason] = useState("");
  const [expectedResourcesAt, setExpectedResourcesAt] = useState("");
  const [assistanceDepartment, setAssistanceDepartment] = useState("");
  const [assistanceSection, setAssistanceSection] = useState("");
  const [assistanceDetails, setAssistanceDetails] = useState("");
  const [assistanceReason, setAssistanceReason] = useState("");
  const [savingDepartmentAssistance, setSavingDepartmentAssistance] = useState(false);
  const [departmentAssistanceNotice, setDepartmentAssistanceNotice] = useState("");
  const [departmentAssistanceHistory, setDepartmentAssistanceHistory] = useState<DatabaseRow[]>([]);
  const [departmentAssistanceLoading, setDepartmentAssistanceLoading] = useState(false);
  const [departmentAssistanceRefresh, setDepartmentAssistanceRefresh] = useState(0);
  const [receivedDepartmentAssistance, setReceivedDepartmentAssistance] = useState<DatabaseRow[]>([]);
  const [receivedDepartmentAssistanceLoading, setReceivedDepartmentAssistanceLoading] = useState(false);


  useEffect(() => {
    const complaintId = selectedComplaint?.id;
    if (!complaintId) {
      setDepartmentAssistanceHistory([]);
      return;
    }
    let cancelled = false;
    const loadAssistance = async () => {
      setDepartmentAssistanceLoading(true);
      const { data, error } = await createClient()
        .from("complaint_updates")
        .select("comment, created_at")
        .eq("complaint_id", complaintId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.warn("Could not load department assistance requests:", error.message);
        setDepartmentAssistanceHistory([]);
      } else {
        setDepartmentAssistanceHistory(
          ((data || []) as DatabaseRow[]).filter((row) =>
            firstText(row, ["comment"]).startsWith("ASSISTANCE FROM ANOTHER DEPARTMENT")
          )
        );
      }
      setDepartmentAssistanceLoading(false);
    };
    void loadAssistance();
    return () => { cancelled = true; };
  }, [selectedComplaint?.id, departmentAssistanceRefresh]);

  useEffect(() => {
    if (!loggedInDepartmentName || !loggedInSectionName) {
      setReceivedDepartmentAssistance([]);
      return;
    }
    let cancelled = false;
    const loadIncomingAssistance = async () => {
      setReceivedDepartmentAssistanceLoading(true);
      try {
        const { data, error } = await createClient()
          .from("complaint_updates")
          .select("id, complaint_id, comment, created_at, updated_by")
          .like("comment", "ASSISTANCE FROM ANOTHER DEPARTMENT%")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const matching = ((data || []) as DatabaseRow[]).filter((row) => {
          const lines = firstText(row, ["comment"]).split("\\n");
          const values = Object.fromEntries(lines.slice(1).map((line) => {
            const splitAt = line.indexOf(": ");
            return splitAt < 0 ? [line, ""] : [line.slice(0, splitAt), line.slice(splitAt + 2)];
          }));
          return values["Requested department"]?.trim().toLowerCase() === loggedInDepartmentName.trim().toLowerCase()
            && values["Requested section"]?.trim().toLowerCase() === loggedInSectionName.trim().toLowerCase();
        });
        if (!cancelled) setReceivedDepartmentAssistance(matching);
      } catch (error) {
        console.warn("Could not load assistance requests for this department:", error);
        if (!cancelled) setReceivedDepartmentAssistance([]);
      } finally {
        if (!cancelled) setReceivedDepartmentAssistanceLoading(false);
      }
    };
    void loadIncomingAssistance();
    return () => { cancelled = true; };
  }, [loggedInDepartmentName, loggedInSectionName, departmentAssistanceRefresh]);

  const [siteAttendance, setSiteAttendance] = useState("Pending");
  const [expectedAttendanceAt, setExpectedAttendanceAt] = useState("");
  const [siteAttendedAt, setSiteAttendedAt] = useState("");
  const [assessmentFindings, setAssessmentFindings] = useState("");
  const [workPerformed, setWorkPerformed] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [outstandingWork, setOutstandingWork] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [expectedCompletionAt, setExpectedCompletionAt] = useState("");
  const [councillorAlertedAt, setCouncillorAlertedAt] = useState<Record<string, string>>({});
  const [expandedAlertKeys, setExpandedAlertKeys] = useState<Record<string, boolean>>({});
  const [bulkTeamMemberIds, setBulkTeamMemberIds] = useState<string[]>([]);
  const [bulkTeamInstructions, setBulkTeamInstructions] = useState("");
  const [savingBulkAlertKey, setSavingBulkAlertKey] = useState<string | null>(null);
  const [bulkDispatchNotice, setBulkDispatchNotice] = useState("");
  const [reassigningBulkAlertKey, setReassigningBulkAlertKey] = useState<string | null>(null);
  const [bulkComplaintStatus, setBulkComplaintStatus] = useState<ComplaintStatus>("Resolved");
  const [bulkComplaintNote, setBulkComplaintNote] = useState("");
  const [bulkResourceAvailability, setBulkResourceAvailability] = useState("Not assessed");
  const [bulkResourcesNeeded, setBulkResourcesNeeded] = useState("");
  const [bulkResourceShortageReason, setBulkResourceShortageReason] = useState("");
  const [bulkExpectedResourcesAt, setBulkExpectedResourcesAt] = useState("");
  const [savingBulkComplaintKey, setSavingBulkComplaintKey] = useState<string | null>(null);
  const [bulkComplaintNotice, setBulkComplaintNotice] = useState<Record<string, string>>({});
  const [teamFollowupNotes, setTeamFollowupNotes] = useState<Record<string, string>>({});
  const [savingTeamFollowupKey, setSavingTeamFollowupKey] = useState<string | null>(null);
  const [teamFollowupNotice, setTeamFollowupNotice] = useState<Record<string, string>>({});
  const [today, setToday] = useState<Date | null>(null);
  // Clerk accounts are classified with the supervisor role by the role resolver.
  const canUseOperationalUpdates = isAdministratorAccount || isSupervisorAccount || isCallCentreAgentAccount;
  useEffect(() => {
    let cancelled = false;
    const restoreCouncillorAlerts = async () => {
      // The database event log is authoritative, so the alert state follows the user across devices.
      try {
        const supabase = createClient();
        const { data, error } = await supabase.from("ward_alert_events")
          .select("alert_key, action, created_at")
          .eq("action", "councillor_alerted")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const latest: Record<string, string> = {};
        (data ?? []).forEach((event: DatabaseRow) => {
          const key = firstText(event, ["alert_key"]);
          const timestamp = firstText(event, ["created_at"]);
          if (key && timestamp && !latest[key]) latest[key] = timestamp;
        });
        if (!cancelled && Object.keys(latest).length) setCouncillorAlertedAt(latest);
      } catch (error) {
        console.warn("Could not load councillor alert history from the database:", error);
        try {
          const saved = window.localStorage.getItem("elm-councillor-alerted");
          if (saved) { const parsed: unknown = JSON.parse(saved); if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && !cancelled) setCouncillorAlertedAt(parsed as Record<string, string>); }
        } catch (fallbackError) { console.warn("Could not restore local councillor alert fallback:", fallbackError); }
      }
    };
    void restoreCouncillorAlerts();
    return () => { cancelled = true; };
  }, []);
  // Stage 1: Call Centre Agents load active Supervisor/Clerk profiles for the
  // complaint's destination section. Stage 2 staff dispatch remains separate.
  useEffect(() => {
    if (!selectedComplaint || !isCallCentreAgentAccount) {
      setEligibleRoutingUsers([]);
      setRoutingLoading(false);
      return;
    }
    const sectionId = firstText(selectedComplaint.raw, ["section_id", "sectionId"]);
    const departmentId = firstText(selectedComplaint.raw, ["department_id", "departmentId"]);
    if (!sectionId) {
      setEligibleRoutingUsers([]);
      setRoutingError("This complaint does not have a valid section ID. Correct its department and section before routing it.");
      return;
    }
    let cancelled = false;
    const loadRoutingUsers = async () => {
      setRoutingLoading(true);
      setRoutingError("");
      try {
        const supabase = createClient();
        let query = supabase.from("profiles")
          .select("*")
          .eq("section_id", sectionId)
          .eq("is_active", true);
        if (departmentId) query = query.eq("department_id", departmentId);
        const { data, error } = await query.order("full_name", { ascending: true });
        if (error) throw error;
        const people = ((data || []) as DatabaseRow[]).filter((person) => {
          const role = firstText(person, ["access_level", "role"]).trim().toLowerCase();
          return ["supervisor", "departmental supervisor", "clerk"].includes(role);
        });
        if (!cancelled) setEligibleRoutingUsers(people);
      } catch (error) {
        if (!cancelled) {
          setEligibleRoutingUsers([]);
          setRoutingError(error instanceof Error ? error.message : "Could not load the Supervisor and Clerk list for this section.");
        }
      } finally {
        if (!cancelled) setRoutingLoading(false);
      }
    };
    void loadRoutingUsers();
    return () => { cancelled = true; };
  }, [selectedComplaint?.id, isCallCentreAgentAccount]);

  // Load the supervisor's active section staff as soon as the profile/section
  // is known. Bulk dispatch must not depend on opening an individual complaint.
  useEffect(() => {
    if (!loggedInSectionId || !isSupervisorAccount) {
      setEligibleOfficials([]);
      setBulkStaffLoadError("");
      return;
    }

    let cancelled = false;
    const loadBulkDispatchStaff = async () => {
      setBulkStaffLoading(true);
      setBulkStaffLoadError("");
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("staff_directory")
          .select("id, full_name, employee_number, designation, department_id, section_id, contact_number, is_active, standby_available, duty_type, shift_type")
          .eq("section_id", loggedInSectionId)
          .eq("is_active", true)
          .order("full_name", { ascending: true });

        if (error) throw error;
        if (!cancelled) setEligibleOfficials((data || []) as DatabaseRow[]);
      } catch (error) {
        if (!cancelled) {
          setEligibleOfficials([]);
          setBulkStaffLoadError(error instanceof Error ? error.message : "Could not load the section staff directory.");
        }
      } finally {
        if (!cancelled) setBulkStaffLoading(false);
      }
    };

    void loadBulkDispatchStaff();
    return () => { cancelled = true; };
  }, [loggedInSectionId, isSupervisorAccount]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("emsms-ward-alert-bulk-dispatch-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ward_alert_team_assignments" }, (payload) => {
        const changed = (payload.new || payload.old) as DatabaseRow | undefined;
        const changedId = firstText(changed || {}, ["id"]);
        if (payload.eventType === "DELETE") {
          setBulkTeamDispatches((current) => current.filter((row) => firstText(row, ["id"]) !== changedId));
          return;
        }
        if (payload.new) {
          const nextRow = payload.new as DatabaseRow;
          setBulkTeamDispatches((current) => [nextRow, ...current.filter((row) => firstText(row, ["id"]) !== firstText(nextRow, ["id"]))]
            .sort((a, b) => (new Date(firstText(b, ["updated_at", "created_at"])).getTime() || 0) - (new Date(firstText(a, ["updated_at", "created_at"])).getTime() || 0)));
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const saveBulkAlertResources = async (alert: { key: string; ward: string; count: number; references: string[]; tickets: Complaint[] }) => {
    if (savingBulkComplaintKey) return;
    const targetComplaints = alert.tickets;
    if (targetComplaints.length === 0) {
      setBulkComplaintNotice((current) => ({ ...current, [alert.key]: "There are no complaints available to receive this resource update." }));
      return;
    }
    const ids = targetComplaints.map((ticket) => String(ticket.raw.id ?? ticket.id ?? "").trim()).filter((id) => id && !id.startsWith("complaint-"));
    if (ids.length !== targetComplaints.length) {
      setBulkComplaintNotice((current) => ({ ...current, [alert.key]: "One or more complaints are missing a valid database ID. Refresh the dashboard and try again." }));
      return;
    }
    const hasResourceDetails = bulkResourceAvailability !== "Not assessed" || bulkResourcesNeeded.trim() || bulkResourceShortageReason.trim() || bulkExpectedResourcesAt;
    if (!hasResourceDetails) {
      setBulkComplaintNotice((current) => ({ ...current, [alert.key]: "Enter resource information before saving." }));
      return;
    }
    setSavingBulkComplaintKey(alert.key);
    setBulkComplaintNotice((current) => ({ ...current, [alert.key]: "" }));
    try {
      const supabase = createClient();
      const { data: authResult, error: authError } = await supabase.auth.getUser();
      if (authError || !authResult.user) throw new Error(authError?.message || "Your sign-in session has expired. Sign in again and retry.");
      const resourceRows = targetComplaints.map((ticket) => ({
        complaint_id: String(ticket.raw.id ?? ticket.id),
        complaint_reference: ticket.reference,
        update_type: "Resources Required",
        message: `Resources and constraints recorded for Ward ${alert.ward} bulk complaint alert. Recorded by: ${loggedInName || "Municipal staff"}.`,
        resource_status: bulkResourceAvailability,
        resources_needed: bulkResourcesNeeded.trim() || null,
        resource_shortage_reason: bulkResourceShortageReason.trim() || null,
        expected_resources_at: bulkExpectedResourcesAt ? new Date(bulkExpectedResourcesAt).toISOString() : null,
        created_by: authResult.user.id,
        shift_type: "Normal Shift",
      }));
      const { error } = await supabase.from("complaint_work_updates").insert(resourceRows);
      if (error) throw new Error(`Could not save resource information: ${error.message}`);
      setBulkComplaintNotice((current) => ({ ...current, [alert.key]: `Resources and constraints saved to the operational history of all ${resourceRows.length} complaints in Ward ${alert.ward}.` }));
      setBulkResourcesNeeded("");
      setBulkResourceShortageReason("");
      setBulkExpectedResourcesAt("");
      setBulkResourceAvailability("Not assessed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred while saving resource information.";
      setBulkComplaintNotice((current) => ({ ...current, [alert.key]: message }));
    } finally {
      setSavingBulkComplaintKey(null);
    }
  };

  const updateAllAlertComplaints = async (alert: { key: string; ward: string; count: number; references: string[]; tickets: Complaint[] }) => {
    if (savingBulkComplaintKey) return;
    const targetComplaints = alert.tickets;
    if (targetComplaints.length === 0) {
      setBulkComplaintNotice((current) => ({ ...current, [alert.key]: "All complaints in this alert are already resolved." }));
      return;
    }
    const ids = targetComplaints.map((ticket) => String(ticket.raw.id ?? ticket.id ?? "").trim()).filter((id) => id && !id.startsWith("complaint-"));
    if (ids.length !== targetComplaints.length) {
      setBulkComplaintNotice((current) => ({ ...current, [alert.key]: "One or more complaints are missing a valid database ID. Refresh the dashboard and try again." }));
      return;
    }
    setSavingBulkComplaintKey(alert.key);
    setBulkComplaintNotice((current) => ({ ...current, [alert.key]: "" }));
    try {
      const supabase = createClient();
      const { data: authResult, error: authError } = await supabase.auth.getUser();
      if (authError || !authResult.user) throw new Error(authError?.message || "Your sign-in session has expired. Sign in again and retry.");
      const statusToDatabase: Record<string, string> = { Received: "New", New: "New", "In Progress": "In Progress", Resolved: "Resolved" };
      const nextStatus = statusToDatabase[bulkComplaintStatus] || "Resolved";
      const { data: updatedRows, error: updateError } = await supabase
        .from("complaints")
        .update({ status: nextStatus })
        .in("id", ids)
        .select("id, status");
      if (updateError) throw new Error(`Could not update all complaints: ${updateError.message}`);
      const updated = (updatedRows || []) as DatabaseRow[];
      const updatedIds = new Set(updated.map((row) => firstText(row, ["id"])));
      if (updatedIds.size !== ids.length) throw new Error(`Only ${updatedIds.size} of ${ids.length} complaints were updated. Check the complaints UPDATE policy and try again.`);
      // Email complainants whose complaint has just become Resolved.
      const newlyResolvedIds = nextStatus === "Resolved"
        ? targetComplaints.filter((ticket) => String(ticket.raw.status ?? ticket.status) !== "Resolved").map((ticket) => String(ticket.raw.id ?? ticket.id))
        : [];
      const emailNote = newlyResolvedIds.length > 0 ? (await notifyComplainants({ event: "resolved", ids: newlyResolvedIds })).message : "";
      const nowIso = new Date().toISOString();
      const auditRows = targetComplaints.map((ticket) => ({
        complaint_id: String(ticket.raw.id ?? ticket.id),
        updated_by: authResult.user.id,
        old_status: String(ticket.raw.status ?? ticket.status),
        new_status: nextStatus,
        comment: bulkComplaintNote.trim() || `Bulk status update for Ward ${alert.ward} repeated-complaint alert by ${loggedInName || "Call Centre Agent"}.`,
        created_at: nowIso,
      }));
      const { error: auditError } = await supabase.from("complaint_updates").insert(auditRows);
      const hasBulkResourceDetails = bulkResourceAvailability !== "Not assessed" || bulkResourcesNeeded.trim() || bulkResourceShortageReason.trim() || bulkExpectedResourcesAt;
      let resourceHistoryError: string | null = null;
      if (hasBulkResourceDetails) {
        const resourceRows = targetComplaints.map((ticket) => ({
          complaint_id: String(ticket.raw.id ?? ticket.id),
          complaint_reference: ticket.reference,
          update_type: "Resources Required",
          message: [bulkComplaintNote.trim() || `Resource information updated for Ward ${alert.ward} bulk complaint alert.`, `Recorded by: ${loggedInName || "Municipal staff"}.`].filter(Boolean).join(" "),
          resource_status: bulkResourceAvailability,
          resources_needed: bulkResourcesNeeded.trim() || null,
          resource_shortage_reason: bulkResourceShortageReason.trim() || null,
          expected_resources_at: bulkExpectedResourcesAt ? new Date(bulkExpectedResourcesAt).toISOString() : null,
          created_by: authResult.user.id,
          shift_type: "Normal Shift",
        }));
        const { error: resourceError } = await supabase.from("complaint_work_updates").insert(resourceRows);
        if (resourceError) resourceHistoryError = resourceError.message;
      }
      setComplaints((current) => current.map((ticket) => {
        if (!updatedIds.has(String(ticket.raw.id ?? ticket.id))) return ticket;
        return { ...ticket, status: normalizeStatus(nextStatus), raw: { ...ticket.raw, status: nextStatus } };
      }));
      setBulkComplaintNotice((current) => ({
        ...current,
        [alert.key]: [
          auditError ? `${updatedIds.size} complaints updated to ${nextStatus}, but the audit history could not be saved: ${auditError.message}` : `Successfully updated all ${updatedIds.size} complaints in Ward ${alert.ward} to ${nextStatus}.`,
          resourceHistoryError ? `Resource details could not be saved: ${resourceHistoryError}` : hasBulkResourceDetails ? "Resource details were added to each complaint's operational history." : "",
          emailNote,
        ].filter(Boolean).join(" "),
      }));
      setBulkComplaintNote("");
      setBulkResourcesNeeded("");
      setBulkResourceShortageReason("");
      setBulkExpectedResourcesAt("");
      setBulkResourceAvailability("Not assessed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred while updating the complaints.";
      setBulkComplaintNotice((current) => ({ ...current, [alert.key]: message }));
    } finally {
      setSavingBulkComplaintKey(null);
    }
  };

  const dispatchBulkWardTeam = async (alert: { key: string; ward: string; count: number; references: string[]; tickets: Complaint[] }) => {
    if (bulkTeamMemberIds.length === 0) {
      setBulkDispatchNotice("Select at least one team member before dispatching.");
      return;
    }
    setSavingBulkAlertKey(alert.key);
    setBulkDispatchNotice("");
    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      const selectedPeople = eligibleOfficials.filter((person) => bulkTeamMemberIds.includes(firstText(person, ["id"])));
      const teamNames = selectedPeople.map((person) => firstText(person, ["full_name", "username", "email"], "Staff member"));
      // Dispatch only the complaints that belong to this specific ward-and-issue alert.
      const alertComplaints = alert.tickets;
      const complaintIds = alertComplaints.map((complaint) => firstText(complaint.raw, ["id", "complaint_id"])).filter(Boolean);
      const complaintRefs = alertComplaints.map((complaint) => complaint.reference);
      const dispatchPayload = {
        alert_key: alert.key,
        ward: alert.ward,
        complaint_count: alert.count,
        complaint_ids: complaintIds,
        complaint_references: complaintRefs,
        team_member_ids: selectedPeople.map((person) => firstText(person, ["id"])).filter(Boolean),
        team_member_names: teamNames,
        team_member_contacts: selectedPeople.map((person) => firstText(person, ["phone", "contact_number", "mobile", "telephone"], "Not provided")),
        assigned_by: authData.user?.id ?? null,
        assigned_by_name: loggedInName,
        status: "Dispatched",
        instructions: bulkTeamInstructions.trim() || null,
      };
      // Return the database row so the supervisor immediately sees the saved dispatch,
      // and the Call Centre sees the same record on the next realtime event/refresh.
      const { data: savedDispatch, error } = await supabase
        .from("ward_alert_team_assignments")
        .insert(dispatchPayload)
        .select("*")
        .single();
      if (error) throw error;
      if (savedDispatch) {
        setBulkTeamDispatches((current) => [savedDispatch as DatabaseRow, ...current.filter((row) => firstText(row, ["id"]) !== firstText(savedDispatch as DatabaseRow, ["id"]))]);
      }
      const { error: logError } = await supabase.from("ward_alert_events").insert({
        alert_key: alert.key,
        ward: alert.ward,
        complaint_count: alert.count,
        complaint_references: complaintRefs,
        action: "bulk_team_dispatched",
        department: "Ward-wide response",
        section: teamNames.join(", "),
        marked_by: authData.user?.id ?? null,
        marked_by_name: loggedInName,
        created_at: new Date().toISOString(),
      });
      if (logError) {
        console.warn("Bulk team was dispatched but activity log event could not be recorded:", logError.message);
      }
      // Update Recent Activity immediately instead of waiting for the periodic refresh.
      const activityTime = new Date();
      setActivities((current) => [{
        title: "Bulk ward response dispatched",
        description: `Ward ${alert.ward} · Team: ${teamNames.join(", ")} · Dispatched by ${loggedInName} · ${complaintRefs.length} complaint references · Instructions: ${bulkTeamInstructions.trim() || "None entered"}`,
        timestamp: activityTime.getTime(),
        time: activityTime.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }),
      }, ...current].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10));
      setBulkDispatchNotice(`Ward ${alert.ward} response dispatched to: ${teamNames.join(", ")}. The dispatch details are saved and will be visible to the Call Centre.`);
      setBulkTeamMemberIds([]);
      setBulkTeamInstructions("");
    } catch (error) {
      setBulkDispatchNotice(error instanceof Error ? error.message : "Could not dispatch the ward response team. Check the migration and permissions.");
    } finally {
      setSavingBulkAlertKey(null);
    }
  };

  const recordTeamFollowupCall = async (alert: { key: string; ward: string; count: number; references: string[] }, dispatch: DatabaseRow) => {
    const dispatchId = firstText(dispatch, ["id"]);
    const noteKey = `${alert.key}::${dispatchId}`;
    const notes = (teamFollowupNotes[noteKey] || "").trim();
    if (!notes) {
      setTeamFollowupNotice((current) => ({ ...current, [noteKey]: "Enter the update provided by the team before saving the call log." }));
      return;
    }
    setSavingTeamFollowupKey(noteKey);
    setTeamFollowupNotice((current) => ({ ...current, [noteKey]: "" }));
    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      const { error } = await supabase.from("ward_alert_follow_up_updates").insert({
        alert_key: alert.key,
        ward: alert.ward,
        dispatch_id: dispatchId || null,
        team_member_names: Array.isArray(dispatch.team_member_names) ? dispatch.team_member_names : [],
        team_member_contacts: Array.isArray(dispatch.team_member_contacts) ? dispatch.team_member_contacts : [],
        call_update: notes,
        recorded_by: authData.user?.id ?? null,
        recorded_by_name: loggedInName,
      });
      if (error) throw error;
      const { error: eventError } = await supabase.from("ward_alert_events").insert({
        alert_key: alert.key,
        ward: alert.ward,
        complaint_count: alert.count,
        complaint_references: alert.references,
        action: "team_follow_up_call",
        department: "Ward-wide response",
        section: notes.slice(0, 180),
        marked_by: authData.user?.id ?? null,
        marked_by_name: loggedInName,
        created_at: new Date().toISOString(),
      });
      if (eventError) console.warn("Call follow-up saved, but its activity event could not be recorded:", eventError.message);
      setTeamFollowupNotes((current) => ({ ...current, [noteKey]: "" }));
      setTeamFollowupNotice((current) => ({ ...current, [noteKey]: "Call update saved to the ward alert history." }));
      // Refresh this dashboard's shared activity feed without requiring a page reload.
      setActivities((current) => [{ title: "Call Centre follow-up recorded", description: `Ward ${alert.ward} · Team: ${Array.isArray(dispatch.team_member_names) ? (dispatch.team_member_names as unknown[]).map(String).join(", ") : "Assigned team"} · by ${loggedInName} · ${notes}`, timestamp: Date.now(), time: new Date().toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) }, ...current].slice(0, 10));
    } catch (error) {
      setTeamFollowupNotice((current) => ({ ...current, [noteKey]: error instanceof Error ? error.message : "Could not save the call update. Check the migration and permissions." }));
    } finally {
      setSavingTeamFollowupKey(null);
    }
  };

  const recordCouncillorAlerted = async (alertKey: string) => {
    const alert = actualRepeatedIssueAlerts.find((item) => item.key === alertKey);
    if (!alert) {
      setBulkDispatchNotice("This ward alert could not be found. Refresh the dashboard and try again.");
      return;
    }
    const timestamp = new Date().toISOString();
    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      const alertComplaints = alert.tickets;
      const complaintRefs = alertComplaints.map((complaint) => complaint.reference);
      const { error } = await supabase.from("ward_alert_events").insert({
        alert_key: alert.key,
        ward: alert.ward,
        complaint_count: alertComplaints.length,
        complaint_references: complaintRefs,
        action: "councillor_alerted",
        department: "Ward-wide response",
        section: "Councillor notification",
        marked_by: authData.user?.id ?? null,
        marked_by_name: loggedInName,
        created_at: timestamp,
      });
      if (error) throw error;
      setCouncillorAlertedAt((current) => {
        const updated = { ...current, [alertKey]: timestamp };
        try { window.localStorage.setItem("elm-councillor-alerted", JSON.stringify(updated)); }
        catch (storageError) { console.warn("Could not save local councillor alert fallback:", storageError); }
        return updated;
      });
    } catch (error) {
      console.error("Could not record councillor alert in the activity log:", error);
      setBulkDispatchNotice(error instanceof Error ? `Could not record this alert: ${error.message}` : "The councillor alert could not be saved to the activity log. Check the ward-alert SQL migration and permissions.");
    }
  };
  useEffect(() => {
    // Resolve the current date in the browser to avoid unstable server prerendering.
    setToday(new Date());
  }, []);
  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error || !data.user) {
        window.location.assign("/login");
        return;
      }
      const user = data.user;
      const metadata = user.user_metadata || {};
      const { data: savedPermissions, error: permissionsError } = await supabase
        .from("user_permissions")
        .select("pages")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!mounted) return;
      if (permissionsError) {
        console.error("Could not load page permissions:", permissionsError.message);
        setAllowedPages(["Dashboard"]);
      } else {
        const pages = normalizePageList(savedPermissions?.pages);
        setAllowedPages(pages.includes("Dashboard") ? pages : ["Dashboard"]);
      }
      setPermissionsLoaded(true);
      // The profiles table is the source of truth for role and department.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("access_level, department_id, section_id, full_name, username, is_active")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) {
        console.error("Could not load the signed-in user's profile:", profileError.message);
      }
      // Some existing accounts store the role under different metadata keys or
      // use legacy role labels. Normalize all known role sources before applying
      // page restrictions so administrators are never trapped on the dashboard.
      const roleCandidates = [
        profile?.access_level,
        metadata.access_level,
        metadata.role,
        metadata.user_role,
        metadata.role_name,
      ].map((value) => String(value ?? "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim());
      const isAdministrator = roleCandidates.some((value) =>
        ["administrator", "system administrator", "admin", "system admin", "super admin", "super administrator", "municipal administrator"].includes(value)
      );
      const isSupervisor = roleCandidates.some((value) =>
        ["supervisor", "departmental supervisor", "call centre agent supervisor", "call center agent supervisor", "clerk"].includes(value)
      );
      const isCallCentreAgent = roleCandidates.some((value) =>
        ["call centre agent", "call center agent", "call-centre agent", "call-centre", "call center", "call centre"].includes(value)
      );
      // Management roles use their dedicated overview dashboards. Keep this
      // redirect here, after the authenticated profile has been resolved, so
      // the ordinary call-centre/supervisor dashboard is not briefly loaded.
      const managementDashboardByRole: Record<string, string> = {
        "department manager": "department-manager",
        "departmental manager": "department-manager",
        "assistant manager": "assistant-manager",
        director: "director",
        "municipal manager": "municipal-manager",
        communications: "communications",
        "communications officer": "communications",
      };
      const managementDashboard = roleCandidates
        .map((role) => managementDashboardByRole[role])
        .find(Boolean);
      if (!isAdministrator && managementDashboard) {
        window.location.replace(`/dashboard/role/${managementDashboard}`);
        return;
      }
      setIsAdministratorAccount(isAdministrator);
      setIsSupervisorAccount(isSupervisor);
      setIsCallCentreAgentAccount(isCallCentreAgent);
      if (isAdministrator) {
        // Administrator navigation must not depend on a user_permissions row.
        setAllowedPages(["Dashboard", "Complaints", "Departments", "Reports", "Users & Roles", "Settings"]);
      } else if (isSupervisor) {
        // Supervisors and Clerks have the dashboard and reports view; complaint assignment
        // and dispatch are available from the unified dashboard alert workflow.
        setAllowedPages(["Dashboard", "Reports"]);
      } else if (isCallCentreAgent) {
        // Call Centre Agents must always have access to the complaint register,
        // department directory and reports, even if a legacy permission row is
        // missing, stale, or uses older page labels.
        setAllowedPages(["Dashboard", "Complaints", "Departments", "Reports"]);
      } else {
        const { data: currentPermissions, error: currentPermissionsError } = await supabase
          .from("user_permissions")
          .select("pages")
          .eq("user_id", user.id)
          .maybeSingle();
        if (currentPermissionsError) {
          console.error("Could not load page permissions:", currentPermissionsError.message);
          setAllowedPages(["Dashboard"]);
        } else {
          const pages = normalizePageList(currentPermissions?.pages);
          // Always keep Dashboard available, but preserve every explicitly granted page
          // even if the saved value has different casing or extra whitespace.
          setAllowedPages(Array.from(new Set(["Dashboard", ...pages])));
        }
      }
      const departmentId = String(profile?.department_id || metadata.department_id || "").trim();
      const sectionId = String(profile?.section_id || metadata.section_id || "").trim();
      setLoggedInRole(String(profile?.access_level || metadata.access_level || metadata.role || metadata.user_role || metadata.role_name || "").trim());
      setLoggedInDepartmentId(departmentId);
      setLoggedInSectionId(sectionId);
      if (profile?.is_active === false) {
        await supabase.auth.signOut();
        window.location.assign("/login?error=inactive");
        return;
      }
      if (sectionId) {
        const { data: section } = await supabase
          .from("sections")
          .select("name")
          .eq("id", sectionId)
          .maybeSingle();
        if (mounted) setLoggedInSectionName(String(section?.name || "Assigned section"));
      }
      if (departmentId) {
        const { data: department } = await supabase
          .from("departments")
          .select("name")
          .eq("id", departmentId)
          .maybeSingle();
        if (mounted) setLoggedInDepartmentName(String(department?.name || "Assigned department"));
      }
      // Support the common metadata field names used when creating users.
      const firstName = String(
        metadata.first_name || metadata.firstName || metadata.given_name || ""
      ).trim();
      const surname = String(
        metadata.surname || metadata.last_name || metadata.lastName || metadata.family_name || ""
      ).trim();
      const fullName = String(
        metadata.full_name || metadata.fullName || metadata.display_name || metadata.name || ""
      ).trim();
      const displayName = [firstName, surname].filter(Boolean).join(" ") || fullName;
      setLoggedInName(String(profile?.full_name || profile?.username || displayName || user.email || "Signed-in user"));
      setLoggedInEmail(user.email || "");
    };
    void loadUser();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // Redirect only after an explicit sign-out. The initial session event can
      // briefly contain a null session while Supabase restores persisted auth.
      if (event === "SIGNED_OUT") {
        window.location.assign("/login");
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    let refreshInProgress = false;

    async function loadDashboardData() {
      if (refreshInProgress) return;
      refreshInProgress = true;
      setDataLoading(true);
      setDataError("");
      try {
        // Resolve the current user's role and department before querying complaints.
        // Supervisors and Department Managers must never load the municipality-wide register.
        const { data: authResult, error: authError } = await supabase.auth.getUser();
        if (authError || !authResult.user) {
          window.location.assign("/login");
          return;
        }
        const { data: currentProfile, error: currentProfileError } = await supabase
          .from("profiles")
          .select("access_level, department_id, section_id, is_active")
          .eq("id", authResult.user.id)
          .maybeSingle();
        if (currentProfileError) throw new Error(`Could not verify your role and department: ${currentProfileError.message}`);
        if (!currentProfile) throw new Error("Your staff profile was not found. Ask an administrator to check your account.");
        if (currentProfile.is_active === false) {
          await supabase.auth.signOut();
          window.location.assign("/login?error=inactive");
          return;
        }
        const roleKey = String(currentProfile.access_level || "").trim().toLowerCase();
        const sectionScopedRole = ["supervisor", "departmental supervisor", "clerk", "official", "department manager", "municipal official"].includes(roleKey);
        const manuallyRoutedRole = ["supervisor", "departmental supervisor", "clerk"].includes(roleKey);
        const currentDepartmentId = String(currentProfile.department_id || "").trim();
        const currentSectionId = String(currentProfile.section_id || "").trim();
        let currentSectionName = "";
        if (currentSectionId) {
          const { data: currentSection } = await supabase
            .from("sections")
            .select("name")
            .eq("id", currentSectionId)
            .maybeSingle();
          currentSectionName = String(currentSection?.name || "").trim();
        }
        if (sectionScopedRole && !currentSectionId && !currentSectionName) {
          setComplaints([]);
          setDepartments([]);
          setDataError("Your account is not assigned to a section. Ask an administrator to assign your section before viewing complaints and assignments.");
          return;
        }
        // Fetch complaint records. A department/section selected during capture
        // is not a handover; Supervisor/Clerk visibility is gated below by an
        // explicit Assign/Reassign audit marker.
        let complaintQuery = supabase
          .from("complaints")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1000);
        if (manuallyRoutedRole && currentSectionId) {
          // Supervisor/Clerk visibility follows the saved department and section
          // route, not an individual assignment-history record or staff availability.
          complaintQuery = complaintQuery
            .eq("section_id", currentSectionId);
          if (currentDepartmentId) {
            complaintQuery = complaintQuery.eq("department_id", currentDepartmentId);
          }
        }
        let departmentQuery = supabase.from("departments").select("*");
        if (sectionScopedRole && currentDepartmentId) {
          departmentQuery = departmentQuery.eq("id", currentDepartmentId);
        }
        const [complaintResult, departmentResult, activityResult, assignmentResult, workUpdateResult, wardEventResult, bulkDispatchResult, deletionActivityResult] = await Promise.all([
          complaintQuery,
          departmentQuery,
          supabase.from("complaint_updates").select("*").order("created_at", { ascending: false }),
          supabase.from("complaint_assignment_history").select("*"),
          supabase.from("complaint_work_updates").select("*"),
          supabase.from("ward_alert_events").select("*"),
          supabase.from("ward_alert_team_assignments").select("*"),
          supabase.from("complaint_deletion_activity").select("*"),
        ]);
        if (!mounted) return;
        if (bulkDispatchResult.error) {
          console.warn("Could not load bulk ward team dispatches:", bulkDispatchResult.error.message);
          setBulkTeamDispatches([]);
        } else {
          const dispatchRows = ((bulkDispatchResult.data || []) as DatabaseRow[]).slice().sort((a, b) => {
            const aTime = new Date(firstText(a, ["created_at", "updated_at"])).getTime() || 0;
            const bTime = new Date(firstText(b, ["created_at", "updated_at"])).getTime() || 0;
            return bTime - aTime;
          });
          setBulkTeamDispatches(dispatchRows);
        }
        // Individual staff assignments are retained for display/dispatch only;
        // they do not determine whether a department/section handover occurred.
        // Keep the latest saved assignment snapshot for each complaint.
        // If the history table is not installed yet, the dashboard still loads
        // complaint data and shows the assigned_to value as a fallback.
        if (assignmentResult.error) {
          console.warn("Could not load complaint assignment history:", assignmentResult.error.message);
          setAssignmentByComplaint({});
        } else {
          const historyRows = ((assignmentResult.data || []) as DatabaseRow[])
            .slice()
            .sort((left, right) => {
              const leftDate = firstText(left, ["assigned_at", "created_at", "updated_at"]);
              const rightDate = firstText(right, ["assigned_at", "created_at", "updated_at"]);
              return (rightDate ? new Date(rightDate).getTime() : 0) - (leftDate ? new Date(leftDate).getTime() : 0);
            });
          // Resolve the person who made each assignment from their profile so
          // the assignment panel can show the actor's role and contact details.
          const assigningUserIds = Array.from(new Set(historyRows
            .map((row) => firstText(row, ["assigned_by", "created_by", "assigned_by_user_id"]))
            .filter(Boolean)));
          let assigningProfilesById: Record<string, DatabaseRow> = {};
          if (assigningUserIds.length) {
            const { data: assigningProfiles, error: assigningProfilesError } = await supabase
              .from("profiles")
              .select("*")
              .in("id", assigningUserIds);
            if (assigningProfilesError) {
              console.info("Could not resolve assignment creator profiles:", assigningProfilesError.message);
            } else {
              assigningProfilesById = Object.fromEntries(((assigningProfiles || []) as DatabaseRow[])
                .map((profile) => [firstText(profile, ["id"]), profile])
                .filter(([id]) => Boolean(id)));
            }
          }
          const latestStaffByComplaint: Record<string, DatabaseRow> = {};
          const routingRowsByComplaint: Record<string, DatabaseRow[]> = {};
          historyRows.forEach((sourceRow) => {
            const actorId = firstText(sourceRow, ["assigned_by", "created_by", "assigned_by_user_id"]);
            const row: DatabaseRow = {
              ...sourceRow,
              _assigned_by_profile: actorId ? assigningProfilesById[actorId] || null : null,
            };
            const complaintId = firstText(row, ["complaint_id"]);
            if (!complaintId) return;
            // Keep field-team dispatch separate from first-stage Supervisor/Clerk routing.
            // An explicit Unassigned row supersedes any older staff assignment.
            const assignmentAction = firstText(row, ["action"]).trim().toLowerCase();
            if (["unassigned", "unassign", "removed"].includes(assignmentAction)) {
              if (!latestStaffByComplaint[complaintId]) latestStaffByComplaint[complaintId] = row;
            } else if (firstText(row, ["assigned_staff_id"])) {
              if (!latestStaffByComplaint[complaintId]) latestStaffByComplaint[complaintId] = row;
            } else if (firstText(row, ["new_assignee_id"])) {
              if (!routingRowsByComplaint[complaintId]) routingRowsByComplaint[complaintId] = [];
              routingRowsByComplaint[complaintId].push(row);
            }
          });
          setAssignmentByComplaint(latestStaffByComplaint);
          setRoutingByComplaint(routingRowsByComplaint);
        }
        let visibleComplaintIds = new Set<string>();
        let visibleComplaintRefs = new Set<string>();
        let rawComplaints: DatabaseRow[] = [];
        const belongsToVisibleComplaint = (row: DatabaseRow) => {
          const complaintId = firstText(row, ["complaint_id", "complaintId"]);
          const complaintRef = firstText(row, ["complaint_reference", "reference_no", "reference_number", "reference"]);
          if (complaintId) return visibleComplaintIds.has(complaintId);
          if (complaintRef) return visibleComplaintRefs.has(complaintRef);
          return false;
        };
        if (complaintResult.error) {
          console.error("Could not load complaints:", complaintResult.error.message);
          setDataError(`Could not load complaints: ${complaintResult.error.message}`);
          setComplaints([]);
        } else {
          const allComplaintRows = (complaintResult.data || []) as DatabaseRow[];
          const rawDepartments = (departmentResult.data || []) as DatabaseRow[];
          const departmentNames = new Map<string, string>();
          const departmentIdsByName = new Map<string, string>();
          rawDepartments.forEach((row) => {
            const id = firstText(row, ["id", "department_id"]);
            const name = firstText(row, ["name", "department_name", "title", "directorate_name"], "Department");
            if (id) departmentNames.set(id, name);
            if (name) departmentIdsByName.set(name.trim().toLocaleLowerCase("en-ZA"), id);
          });
          const currentDepartmentName = departmentNames.get(currentDepartmentId) || loggedInDepartmentName;
          const departmentNameKey = currentDepartmentName.trim().toLocaleLowerCase("en-ZA");
          const sectionNameKey = currentSectionName.trim().toLocaleLowerCase("en-ZA");
          // A selected department/section at capture time is only routing
          // information. Supervisor/Clerk queues receive a complaint only after
          // the Call Centre explicitly uses Assign/Reassign in the routing panel.
          // The handover marker is written to complaint_updates by that action;
          // it is independent of individual staff availability or assignment.
          const explicitlyHandedOverComplaintIds = new Set<string>(
            ((activityResult.data || []) as DatabaseRow[])
              .filter((update) => firstText(update, ["comment"]).startsWith("DEPARTMENT_SECTION_HANDOVER|"))
              .map((update) => firstText(update, ["complaint_id"]))
              .filter(Boolean)
          );
          rawComplaints = sectionScopedRole
            ? allComplaintRows.filter((row: DatabaseRow) => {
                const rowId = firstText(row, ["id", "complaint_id"]);
                if (manuallyRoutedRole && (!rowId || !explicitlyHandedOverComplaintIds.has(rowId))) return false;
                const rowDepartmentId = firstText(row, ["department_id", "departmentId"]);
                const rowDepartmentName = firstText(row, ["department_name", "department"]);
                const rowSectionId = firstText(row, ["section_id", "sectionId"]);
                const rowSectionName = firstText(row, ["section_name", "section"]);
                const departmentMatches = !currentDepartmentId
                  || rowDepartmentId === currentDepartmentId
                  || (!rowDepartmentId && departmentNameKey && rowDepartmentName.trim().toLocaleLowerCase("en-ZA") === departmentNameKey);
                const sectionMatches = Boolean(
                  (currentSectionId && rowSectionId === currentSectionId) ||
                  (sectionNameKey && rowSectionName.trim().toLocaleLowerCase("en-ZA") === sectionNameKey)
                );
                return departmentMatches && sectionMatches;
              })
            : allComplaintRows;
          visibleComplaintIds = new Set(rawComplaints.map((row) => firstText(row, ["id", "complaint_id"])));
          visibleComplaintRefs = new Set(rawComplaints.map((row) => firstText(row, ["reference_no", "reference_number", "complaint_reference", "reference"])).filter(Boolean));
          const normalized: Complaint[] = rawComplaints.map((row, index) => {
            const departmentId = firstText(row, ["department_id", "departmentId"]);
            const nestedDepartment = firstText(row, ["department", "departments", "department_name"]);
            const department = nestedDepartment || departmentNames.get(departmentId) || "Not assigned";
            const parsedDashboardDate = complaintDashboardDate(row);
            const parsedDate = parsedDashboardDate ? parsedDashboardDate.toISOString() : "";
            return {
              id: firstText(row, ["id", "complaint_id"], `complaint-${index}`),
              reference: firstText(row, ["reference_no", "reference_number", "complaint_reference", "reference"], firstText(row, ["id", "complaint_id"], `complaint-${index}`)),
              subject: firstText(row, ["subject", "title", "complaint_subject", "description", "issue_type"], "Complaint without a subject"),
              department,
              status: normalizeStatus(firstText(row, ["status", "complaint_status", "workflow_status"], "New")),
              priority: normalizePriority(firstText(row, ["priority", "complaint_priority", "urgency"], "Medium")),
              date: parsedDate,
              raw: row,
            };
          });
          normalized.sort((a, b) => (b.date ? new Date(b.date).getTime() : 0) - (a.date ? new Date(a.date).getTime() : 0));
          setComplaints(normalized);
          if (departmentResult?.error) {
            console.error("Could not load departments:", departmentResult.error.message);
            setDepartments([]);
            setDataError((current) => current || `Could not load departments: ${departmentResult.error.message}`);
          } else {
            const complaintCounts = new Map<string, number>();
            normalized.forEach((complaint) => complaintCounts.set(complaint.department, (complaintCounts.get(complaint.department) || 0) + 1));
            const visibleDepartmentRows = sectionScopedRole
              ? rawDepartments.filter((row) => firstText(row, ["id", "department_id"]) === currentDepartmentId)
              : rawDepartments;
            const normalizedDepartments: Department[] = sectionScopedRole
              ? [{ name: currentSectionName || "Assigned section", complaints: normalized.length }]
              : visibleDepartmentRows.map((row, index) => {
                  const name = firstText(row, ["name", "department_name", "title", "directorate_name"], `Department ${index + 1}`);
                  return { name, complaints: complaintCounts.get(name) || 0 };
                });
            // For section-scoped users this panel represents their assigned section,
            // not the wider department. Administrators retain department totals.
            if (!sectionScopedRole) {
              complaintCounts.forEach((count, name) => {
                if (!normalizedDepartments.some((item) => item.name === name)) normalizedDepartments.push({ name, complaints: count });
              });
            }
            setDepartments(normalizedDepartments);
          }
        }
        // Build a unified activity feed. Capturing a complaint is itself an
        // activity, even when no separate complaint_updates row is created.
        const mappedActivities: Activity[] = [];

        // Resolve the person and role behind capture, updates and assignments.
        // Names stored directly on audit rows take precedence; profiles provide
        // the role label so Recent Activity shows both identity and hierarchy.
        const actorIds = new Set<string>();
        const collectActorId = (row: DatabaseRow, keys: string[]) => {
          const id = firstText(row, keys);
          if (id) actorIds.add(id);
        };
        rawComplaints.forEach((row) => collectActorId(row, ["created_by", "captured_by", "user_id"]));
        ((activityResult.data || []) as DatabaseRow[]).forEach((row) => collectActorId(row, ["updated_by", "created_by", "user_id"]));
        ((assignmentResult.data || []) as DatabaseRow[]).forEach((row) => collectActorId(row, ["assigned_by", "created_by", "user_id", "assigned_by_user_id"]));
        ((workUpdateResult.data || []) as DatabaseRow[]).forEach((row) => collectActorId(row, ["created_by", "updated_by", "user_id", "staff_id"]));
        ((wardEventResult.data || []) as DatabaseRow[]).forEach((row) => collectActorId(row, ["marked_by", "created_by", "user_id"]));
        ((bulkDispatchResult.data || []) as DatabaseRow[]).forEach((row) => collectActorId(row, ["assigned_by", "created_by", "user_id"]));
        const actorProfileById = new Map<string, { name: string; role: string }>();
        const actorProfileByName = new Map<string, { name: string; role: string }>();
        if (actorIds.size) {
          const { data: actorProfiles, error: actorProfilesError } = await supabase
            .from("profiles")
            .select("*")
            .in("id", Array.from(actorIds));
          if (actorProfilesError) {
            console.info("Could not resolve activity actor roles:", actorProfilesError.message);
          } else {
            ((actorProfiles || []) as DatabaseRow[]).forEach((profile) => {
              const id = firstText(profile, ["id"]);
              const name = firstText(profile, ["full_name", "username"], "Municipal user");
              const role = firstText(profile, ["access_level", "role", "user_role", "role_name", "job_title", "position", "designation"], "");
              if (id) actorProfileById.set(id, { name, role });
              if (name) actorProfileByName.set(name.toLocaleLowerCase("en-ZA"), { name, role });
            });
          }
        }
        // Technician and field-official accounts may be represented in staff_directory
        // rather than profiles. Resolve those IDs too so their designation is visible.
        if (actorIds.size) {
          const { data: directoryActors, error: directoryActorError } = await supabase
            .from("staff_directory")
            .select("id, full_name, designation")
            .in("id", Array.from(actorIds));
          if (!directoryActorError) {
            ((directoryActors || []) as DatabaseRow[]).forEach((person) => {
              const id = firstText(person, ["id"]);
              const name = firstText(person, ["full_name"], "Municipal staff");
              const role = firstText(person, ["designation"], "Technician");
              if (id && !actorProfileById.has(id)) actorProfileById.set(id, { name, role });
              if (name && !actorProfileByName.has(name.toLocaleLowerCase("en-ZA"))) actorProfileByName.set(name.toLocaleLowerCase("en-ZA"), { name, role });
            });
          }
        }
        const actorLabelFor = (row: DatabaseRow, idKeys: string[], nameKeys: string[]) => {
          const id = firstText(row, idKeys);
          const storedName = firstText(row, nameKeys);
          const profile = (id ? actorProfileById.get(id) : undefined)
            || (storedName ? actorProfileByName.get(storedName.toLocaleLowerCase("en-ZA")) : undefined);
          // The authenticated user's profile is authoritative. Older audit rows may
          // contain a stale or incorrectly copied *_by_name value, so never let that
          // override the profile resolved from the actor UUID.
          const name = profile?.name
            || (id && id === authResult.user.id ? loggedInName : "")
            || storedName
            || "An authorised user";
          const currentUserRole = id && id === authResult.user.id
            ? firstText(currentProfile as DatabaseRow, ["access_level", "role", "user_role", "role_name", "job_title", "position"], loggedInRole)
            : "";
          const rawRole = profile?.role
            || currentUserRole
            || firstText(row, ["updated_by_role", "assigned_by_role", "created_by_role", "actor_role", "role", "designation", "access_level", "job_title", "user_role", "role_name"]);
          const normalizedRole = rawRole.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
          const roleAliases: Record<string, string> = {
            "call centre": "Call Centre Agent", "call center": "Call Centre Agent",
            "call centre agent": "Call Centre Agent", "call center agent": "Call Centre Agent",
            "departmental supervisor": "Supervisor", "department supervisor": "Supervisor",
            "clerk": "Clerk", "technician": "Technician", "administrator": "Administrator",
            "system administrator": "Administrator", "admin": "Administrator", "supervisor": "Supervisor",
          };
          // Known municipal role correction: Khulekani is a Supervisor, not a
          // generic staff-directory member. Apply this by name even when an older
          // audit row resolves through staff_directory with a generic designation.
          const normalizedActorName = name.trim().toLocaleLowerCase("en-ZA");
          const role = normalizedActorName.includes("khulekani")
            ? "Supervisor"
            : roleAliases[normalizedRole] || (rawRole ? rawRole.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "");
          return `${name} (${role || "Staff member"})`;
        };

        // Every newly captured complaint appears in Recent activity using its
        // own creation timestamp. This does not depend on an audit trigger.
        rawComplaints.forEach((row, index) => {
          const reference = firstText(row, ["reference_no", "reference_number", "complaint_reference", "reference"], "Complaint");
          const subject = firstText(row, ["subject", "title", "complaint_subject", "description", "issue_type"], "Complaint captured");
          const activityDate = complaintDashboardDate(row);
          const timestamp = activityDate ? activityDate.getTime() : 0;
          mappedActivities.push({
            title: "New complaint captured",
            description: `${reference} · ${subject} · Captured by ${actorLabelFor(row, ["created_by", "captured_by", "user_id"], ["created_by_name", "captured_by_name", "created_by_full_name"])}`,
            complaintId: firstText(row, ["id", "complaint_id"]) || undefined,
            timestamp: Number.isFinite(timestamp) ? timestamp : 0,
            time: timestamp && Number.isFinite(timestamp)
              ? new Date(timestamp).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
              : `Complaint ${index + 1}`,
          });
        });

        // Include durable complaint deletion audit entries. These remain visible
        // after the original complaint row has been removed.
        if (deletionActivityResult.error) {
          console.info("Could not load complaint deletion activity (run the audit-table SQL setup):", deletionActivityResult.error.message);
        } else {
          ((deletionActivityResult.data || []) as DatabaseRow[])
            .filter((row) => !sectionScopedRole || (firstText(row, ["department_id"]) === currentDepartmentId && firstText(row, ["section_id"]) === currentSectionId))
            .forEach((row, index) => {
              const reference = firstText(row, ["complaint_reference"], "Complaint");
              const subject = firstText(row, ["complaint_subject"], "");
              const deletedBy = firstText(row, ["deleted_by_name"], "An authorised user");
              const rawTime = firstText(row, ["deleted_at", "created_at"]);
              const timestamp = rawTime ? new Date(rawTime).getTime() : 0;
              mappedActivities.push({
                title: "Complaint deleted",
                description: `${reference}${subject ? ` · ${subject}` : ""} · Deleted by ${deletedBy}`,
                timestamp: Number.isFinite(timestamp) ? timestamp : 0,
                time: timestamp ? new Date(timestamp).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : `Deletion ${index + 1}`,
              });
            });
        }

        // Include general complaint updates only while their parent complaint still exists.
        // This keeps the feed clean after deletion; deletion audit rows above remain permanent.
        if (activityResult.error) {
          console.info("Could not load general complaint updates:", activityResult.error.message);
        } else {
          ((activityResult.data || []) as DatabaseRow[])
            .filter((row) => belongsToVisibleComplaint(row))
            .forEach((row, index) => {
              const oldStatus = firstText(row, ["old_status"]);
              const newStatus = firstText(row, ["new_status"]);
              const isStatusChange = Boolean(oldStatus || newStatus);
              const title = isStatusChange
                ? `Complaint status changed to ${normalizeStatus(newStatus || oldStatus)}`
                : firstText(row, ["title", "action", "event", "activity", "status", "update_type"], "Complaint updated");
              const complaintId = firstText(row, ["complaint_id"]);
              const complaint = complaintId
                ? rawComplaints.find((item) => firstText(item, ["id", "complaint_id"]) === complaintId)
                : undefined;
              const reference = complaint
                ? firstText(complaint, ["reference_no", "reference_number", "complaint_reference", "reference"], "Complaint")
                : "Complaint";
              const subject = complaint
                ? firstText(complaint, ["subject", "title", "complaint_subject"], "")
                : "";
              const comment = firstText(row, ["comment", "description", "notes", "message", "details"], "A complaint record was updated.");
              const actor = actorLabelFor(row, ["updated_by", "created_by", "user_id"], ["updated_by_name", "staff_name", "user_name"]);
              // Operational status audit comments already store the authenticated actor
              // as "Updated by: Role – Name". Prefer that authoritative snapshot when
              // older profile IDs cannot be resolved, and do not append a second,
              // misleading generic actor label after the comment.
              const actorFromComment = comment.match(/Updated by:\s*([^–—.\n]+?)\s*[–—]\s*([^\n.]+?)(?=\.\s*(?:Information provided by:|Information received at:|$)|\n|$)/i);
              const commentActorRole = actorFromComment?.[1]?.trim() || "";
              const commentActorName = actorFromComment?.[2]?.trim() || "";
              const resolvedActor = commentActorName
                ? `${commentActorName} (${commentActorRole || "Role not recorded"})`
                : actor;
              const commentAlreadyIdentifiesActor = /Updated by:\s*/i.test(comment);
              const description = isStatusChange
                ? [
                    `${reference}${subject ? ` · ${subject}` : ""}`,
                    `${normalizeStatus(oldStatus || "New")} → ${normalizeStatus(newStatus || oldStatus)}`,
                    comment,
                    !commentAlreadyIdentifiesActor && resolvedActor ? `Updated by ${resolvedActor}` : "",
                  ].filter(Boolean).join(" · ")
                : comment;
              const rawTime = firstText(row, ["created_at", "updated_at", "created_on", "date"]);
              const timestamp = rawTime ? new Date(rawTime).getTime() : 0;
              mappedActivities.push({
                title,
                description,
                complaintId: complaintId || undefined,
                timestamp: Number.isFinite(timestamp) ? timestamp : 0,
                time: timestamp && Number.isFinite(timestamp)
                  ? new Date(timestamp).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
                  : `Update ${index + 1}`,
              });
            });
        }

        // Retain operational work updates so expanded bulk alerts can show the same
        // progress context without requiring each complaint to be opened separately.
        if (workUpdateResult.error) {
          setAllComplaintWorkUpdates([]);
        } else {
          setAllComplaintWorkUpdates(((workUpdateResult.data || []) as DatabaseRow[]).filter((row) => belongsToVisibleComplaint(row)));
        }

        // Include operational work updates such as progress and resolution notes.
        if (workUpdateResult.error) {
          console.info("Could not load complaint work updates:", workUpdateResult.error.message);
        } else {
          ((workUpdateResult.data || []) as DatabaseRow[])
            .filter((row) => belongsToVisibleComplaint(row))
            .forEach((row, index) => {
              const action = firstText(row, ["update_type", "action", "title"], "Work update");
              const updateMessage = firstText(row, ["message", "description", "notes", "update_text", "work_description", "comment"], "Complaint work progress updated.");
              const storedStatus = firstText(row, ["status_after_update", "complaint_status", "status"]);
              const messageStatus = updateMessage.match(/Complaint status changed to:\s*(Assigned|In Progress|Completed|Resolved)/i)?.[1] || "";
              const statusText = storedStatus || messageStatus;
              // A status change already has its own complaint_updates audit entry.
              // Do not add a second Recent Activity item for the paired work-update row.
              if (statusText || /Complaint status changed to:/i.test(updateMessage)) return;
              const description = [
                firstText(row, ["complaint_reference"], "Complaint update"),
                updateMessage,
              ].filter(Boolean).join(" · ");
              const activityTitle = statusText
                ? `Complaint status changed to ${statusText}`
                : `Operational update: ${action}`;
              const rawTime = firstText(row, ["created_at", "updated_at", "created_on"]);
              const timestamp = rawTime ? new Date(rawTime).getTime() : 0;
              mappedActivities.push({
                title: activityTitle,
                description: `${description} · Updated by ${actorLabelFor(row, ["created_by", "updated_by", "user_id"], ["created_by_name", "updated_by_name", "staff_name"])}`,
                complaintId: firstText(row, ["complaint_id"]) || undefined,
                timestamp: Number.isFinite(timestamp) ? timestamp : 0,
                time: timestamp && Number.isFinite(timestamp)
                  ? new Date(timestamp).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
                  : `Work update ${index + 1}`,
              });
            });
        }

        if (assignmentResult.error) {
          console.warn("Could not load assignment activity history:", assignmentResult.error.message);
        } else {
          const rawAssignmentActivities = ((assignmentResult.data || []) as DatabaseRow[])
            .filter((row) => belongsToVisibleComplaint(row));
          const complaintById = new Map<string, Complaint>();
          const complaintByReference = new Map<string, Complaint>();
          complaints.concat([]).forEach((complaint) => {
            complaintById.set(complaint.id, complaint);
            complaintByReference.set(complaint.reference, complaint);
          });
          // Use the rows loaded during this same request; React state updates
          // are asynchronous, so the local normalized list is the reliable source.
          const localComplaintRows = rawComplaints;
          const localDepartmentRows = ((departmentResult.data || []) as DatabaseRow[]);
          const departmentNamesForActivity = new Map<string, string>();
          localDepartmentRows.forEach((row) => {
            const id = firstText(row, ["id", "department_id"]);
            const name = firstText(row, ["name", "department_name", "title", "directorate_name"], "Department");
            if (id) departmentNamesForActivity.set(id, name);
          });
          localComplaintRows.forEach((row: DatabaseRow, index: number) => {
            const id = firstText(row, ["id", "complaint_id"], `complaint-${index}`);
            const reference = firstText(row, ["reference_no", "reference_number", "complaint_reference", "reference"], id);
            const departmentId = firstText(row, ["department_id", "departmentId"]);
            const department = firstText(row, ["department", "departments", "department_name"]) || departmentNamesForActivity.get(departmentId) || "Not assigned";
            const rawDate = firstText(row, ["date_reported", "reported_at", "submitted_at", "created_at", "created_on", "date"]);
            const parsedDate = rawDate && !Number.isNaN(new Date(rawDate).getTime()) ? new Date(rawDate).toISOString() : "";
            const complaint: Complaint = {
              id,
              reference,
              subject: firstText(row, ["subject", "title", "complaint_subject", "description", "issue_type"], "Complaint without a subject"),
              department,
              status: normalizeStatus(firstText(row, ["status", "complaint_status", "workflow_status"], "New")),
              priority: normalizePriority(firstText(row, ["priority", "complaint_priority", "urgency"], "Medium")),
              date: parsedDate,
              raw: row,
            };
            complaintById.set(id, complaint);
            complaintByReference.set(reference, complaint);
          });

          rawAssignmentActivities.forEach((row, index) => {
            const complaintId = firstText(row, ["complaint_id"]);
            const complaintReference = firstText(row, ["complaint_reference", "reference_no", "reference_number"]);
            const complaint = (complaintId ? complaintById.get(complaintId) : undefined)
              || (complaintReference ? complaintByReference.get(complaintReference) : undefined);
            const action = firstText(row, ["action", "event", "activity"], "Assigned");
            const assignee = firstText(row, ["assigned_to_name", "assignee_name", "official_name", "new_assignee_name"], "an official");
            const assigneeDesignation = firstText(row, ["assigned_to_role", "assignee_designation", "staff_designation", "designation"], "Designation not recorded");
            const assignedBy = actorLabelFor(row, ["assigned_by", "created_by", "user_id"], ["assigned_by_name"]);
            const assignedByRole = firstText(row, ["assigned_by_role", "assigner_role", "actor_role"]);
            const reference = complaintReference || complaint?.reference || (complaintId ? `Complaint ${complaintId}` : "Complaint");
            const subject = complaint?.subject ? ` — ${complaint.subject}` : "";
            const assignmentVerb = action.toLowerCase().includes("reassign") ? "Reassigned to" : "Assigned to";
            const details = [`${reference}${subject}`, `${assignmentVerb} ${assignee} (${assigneeDesignation})`, assignedBy ? `by ${assignedBy}${assignedByRole ? ` (${assignedByRole})` : ""}` : "", firstText(row, ["notes", "assignment_notes"])].filter(Boolean).join(" · ");
            const rawTime = firstText(row, ["assigned_at", "created_at", "updated_at", "created_on"]);
            const timestamp = rawTime ? new Date(rawTime).getTime() : 0;
            mappedActivities.push({
              title: action.toLowerCase().includes("reassign") ? "Complaint reassigned" : "Complaint assigned",
              description: details,
              complaintId: complaint?.id || complaintId || undefined,
              timestamp: Number.isFinite(timestamp) ? timestamp : 0,
              time: timestamp && Number.isFinite(timestamp)
                ? new Date(timestamp).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
                : `Assignment ${index + 1}`,
            });
          });
        }

        // Include ward-alert and bulk-team events in Recent activity as well as complaint assignments.
        if (wardEventResult.error) {
          console.warn("Could not load ward alert activity:", wardEventResult.error.message);
        } else {
          ((wardEventResult.data || []) as DatabaseRow[]).forEach((row, index) => {
            const action = firstText(row, ["action"]).toLowerCase();
            const ward = firstText(row, ["ward"], "Unknown");
            const actor = firstText(row, ["marked_by_name"], "An authorised user");
            const eventReferences = Array.isArray(row.complaint_references)
              ? (row.complaint_references as unknown[]).map((value) => String(value)).filter(Boolean)
              : [];

            // For section-scoped accounts, only retain references belonging to
            // complaints already verified as visible in the signed-in user's section.
            // Do not expose other sections' references in a mixed ward event.
            const refs = sectionScopedRole
              ? eventReferences.filter((reference) => visibleComplaintRefs.has(reference))
              : eventReferences;

            // A Supervisor or Clerk must never see an alert event unless it is linked to
            // at least one complaint in their own assigned section.
            if (sectionScopedRole && refs.length === 0) return;
            if (!sectionScopedRole && eventReferences.length > 0 &&
                !eventReferences.some((reference) => visibleComplaintRefs.has(reference))) return;

            const rawTime = firstText(row, ["created_at", "updated_at"]);
            const timestamp = rawTime ? new Date(rawTime).getTime() : 0;
            const isBulkDispatch = action === "bulk_team_dispatched";
            const isCouncillorAlert = action === "councillor_alerted";
            const isTeamFollowup = action === "team_follow_up_call";
            if (!isBulkDispatch && !isCouncillorAlert && !isTeamFollowup) return;

            // Do not display the original event's team/section text to a Supervisor or Clerk:
            // it may describe a wider ward response involving other sections.
            const eventDescription = isBulkDispatch
              ? `Ward ${ward} · ${sectionScopedRole ? "Team dispatch recorded for your section" : `Team: ${firstText(row, ["section"], "Team recorded")}`}`
              : isTeamFollowup
                ? `Ward ${ward} · ${sectionScopedRole ? "Follow-up recorded for your section" : `Call update: ${firstText(row, ["section"], "Update recorded")}`}`
                : `Ward ${ward} · Councillor notification recorded`;

            mappedActivities.push({
              title: isBulkDispatch ? "Bulk ward response dispatched" : isTeamFollowup ? "Call Centre follow-up recorded" : "Councillor marked as alerted",
              description: [eventDescription, `by ${actor}`, refs.length ? `Complaints: ${refs.join(", ")}` : "Complaint references saved in ward alert record"].join(" · "),
              timestamp: Number.isFinite(timestamp) ? timestamp : 0,
              time: timestamp && Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : `Ward alert ${index + 1}`,
            });
          });
        }
        mappedActivities.sort((a, b) => b.timestamp - a.timestamp);
        setActivities(mappedActivities.slice(0, 10));
      } catch (error) {
        console.error("Dashboard data loading failed:", error);
        if (mounted) setDataError(error instanceof Error ? error.message : "An unexpected error occurred while loading dashboard data.");
      } finally {
        refreshInProgress = false;
        if (mounted) setDataLoading(false);
      }
    }

    // Load the latest Supabase data immediately when the dashboard opens.
    void loadDashboardData();

    // Refresh the dashboard as soon as a complaint is inserted, edited,
    // assigned, or otherwise changed in the public.complaints table.
    const complaintChannel = supabase
      .channel("dashboard-complaints-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaints" },
        () => { void loadDashboardData(); }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Dashboard complaint realtime subscription status:", status);
        }
      });

    // Also refresh when assignment history or ward response activity changes.
    const operationsChannel = supabase
      .channel("dashboard-operations-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaint_deletion_activity" },
        () => { void loadDashboardData(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaint_assignment_history" },
        () => { void loadDashboardData(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaint_updates" },
        () => { void loadDashboardData(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaints" },
        () => { void loadDashboardData(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaint_work_updates" },
        () => { void loadDashboardData(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ward_alert_events" },
        () => { void loadDashboardData(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ward_alert_team_assignments" },
        () => { void loadDashboardData(); }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Dashboard operations realtime subscription status:", status);
        }
      });

    // Fallback refresh every 30 seconds in case a realtime event is missed.
    const refreshTimer = window.setInterval(() => { void loadDashboardData(); }, 30_000);

    return () => {
      mounted = false;
      window.clearInterval(refreshTimer);
      void supabase.removeChannel(complaintChannel);
      void supabase.removeChannel(operationsChannel);
    };
  }, []);
  const openComplaintAction = (complaint: Complaint, action: "view" | "edit") => {
    // Supervisors and Clerks may inspect and assign complaints, but cannot edit complaint records.
    if (action === "edit" && ["supervisor", "departmental supervisor", "clerk"].includes(loggedInRole.trim().toLowerCase())) {
      setComplaintActionError("Supervisors and Clerks can view, assign and reassign complaints, but cannot edit complaint records.");
      return;
    }
    setSelectedComplaint(complaint);
    setRoutingNotice("");
    setRoutingError("");
    setRoutingNotesInput("");
    setSelectedSupervisorId("");
    setSelectedClerkId("");
    setRoutingMode("both");
    setEligibleRoutingUsers([]);
    setExpandedComplaintPanels({});
    setComplaintAction(action);
    setComplaintActionError("");
    setEditSubject(complaint.subject);
    setEditDescription(firstText(complaint.raw, ["description", "details", "complaint_description", "issue_description", "narrative"], complaint.subject));
    setEditDepartment(complaint.department === "Not assigned" ? "" : complaint.department);
    setEditStatus(normalizeStatus(String(complaint.raw.status ?? complaint.status)));
    setOperationalUpdateNotice("");
    setRedirectNotice("");
    setRedirectError("");
    const currentDepartmentLabel = REDIRECT_DEPARTMENTS.find((name) =>
      [name, ...(REDIRECT_DEPARTMENT_ALIASES[name] || [])].some((candidate) =>
        normalizeComplaintRouteName(candidate) === normalizeComplaintRouteName(complaint.department)
      )
    ) || "";
    const currentSectionLabel = (currentDepartmentLabel ? REDIRECT_SECTIONS_BY_DEPARTMENT[currentDepartmentLabel] || [] : []).find((name) =>
      [name, ...(REDIRECT_SECTION_ALIASES[name] || [])].some((candidate) =>
        normalizeComplaintRouteName(candidate) === normalizeComplaintRouteName(firstText(complaint.raw, ["section", "section_name"], ""))
      )
    ) || "";
    setRedirectDepartmentName(currentDepartmentLabel);
    setRedirectSectionName(currentSectionLabel);
    const subjectExistsInCaptureCatalogue = REDIRECT_COMPLAINT_SUBJECTS.some((item) =>
      item.department === currentDepartmentLabel &&
      item.section === currentSectionLabel &&
      item.subject === complaint.subject
    );
    setRedirectSubject(subjectExistsInCaptureCatalogue ? complaint.subject : (currentDepartmentLabel && currentSectionLabel ? "Other" : ""));
    setRedirectOtherSubject(subjectExistsInCaptureCatalogue || !currentDepartmentLabel || !currentSectionLabel ? "" : complaint.subject);
    setAssignmentNotice("");
    setAssignmentNotesInput("");
    setSelectedOfficialId("");
    setStaffAssignmentExpanded(true);
    setStaffAssignmentLoading(false);
    // Supervisors and Clerks can assign only to active staff in their own section.
    if (action === "view" && loggedInSectionId) {
      const supabase = createClient();
      setStaffAssignmentLoading(true);
      void (async () => {
        // Staff are created in staff_directory, not profiles. Load the same
        // section-scoped records that Supervisors manage on the Staff Directory.
        const { data, error } = await supabase
          .from("staff_directory")
          .select("id, full_name, employee_number, designation, department_id, section_id, contact_number, is_active, standby_available, duty_type, shift_type")
          .eq("section_id", loggedInSectionId)
          .eq("is_active", true)
          .order("full_name", { ascending: true });
        if (error) {
          console.error("Could not load section staff from staff_directory:", error.message);
          setEligibleOfficials([]);
          setComplaintActionError(`Could not load staff for assignment: ${error.message}`);
          setStaffAssignmentLoading(false);
          return;
        }
        // Do not filter by access_level/job_title: staff_directory uses
        // designation and includes municipal team members without login accounts.
        setEligibleOfficials((data || []) as DatabaseRow[]);
        setStaffAssignmentLoading(false);
      })();
    }
    setOperationalMessage("");
    const assignmentForUpdate = assignmentByComplaint[complaint.id] || {};
    setOfficialFeedbackName(firstText(assignmentForUpdate, ["assigned_to_name", "assignee_name", "official_name"], ""));
    setOfficialFeedbackDesignation(firstText(assignmentForUpdate, ["assigned_to_role", "assigned_to_designation", "designation", "assignee_designation"], ""));
    setOfficialFeedbackContactedAt("");
    setOperationalUpdateType("Received");
    setOperationalUpdateStatus(normalizeStatus(String(complaint.raw?.status ?? complaint.status)));
    setResourceAvailability("Not assessed");
    setResourcesNeeded("");
    setResourceShortageReason("");
    setExpectedResourcesAt("");
    setSiteAttendance("Pending");
    setExpectedAttendanceAt("");
    setSiteAttendedAt("");
    setAssessmentFindings("");
    setWorkPerformed("");
    setDelayReason("");
    setOutstandingWork("");
    setNextAction("");
    setExpectedCompletionAt("");
    if (action === "view") {
      setOperationalUpdatesLoading(true);
      // Redirection uses the same static department/section/subject catalogue
      // as Complaint Capture. It does not require matching UUID rows in the
      // departments or sections tables because capture stores routing labels.
      setRedirectOptionsLoading(false);
      const supabase = createClient();
      void (async () => {
        try {
          const { data, error } = await supabase
            .from("complaint_work_updates")
            .select("*")
            .eq("complaint_reference", complaint.reference)
            .order("created_at", { ascending: false });
          if (error) {
            console.warn("Could not load operational complaint history:", error.message);
            setOperationalUpdates([]);
          } else {
            const workRows = (data || []) as DatabaseRow[];
            // Resolve the creator from the authenticated profile ID saved in
            // complaint_work_updates.created_by. Never depend on message text
            // or a denormalised name that may be missing.
            const creatorIds = Array.from(new Set(workRows
              .map((row) => firstText(row, ["created_by", "updated_by", "user_id"]))
              .filter(Boolean)));
            let profilesById: Record<string, DatabaseRow> = {};
            if (creatorIds.length) {
              const { data: creatorProfiles, error: creatorProfilesError } = await supabase
                .from("profiles")
                .select("*")
                .in("id", creatorIds);
              if (creatorProfilesError) {
                console.warn("Could not resolve operational update creators:", creatorProfilesError.message);
              } else {
                profilesById = Object.fromEntries(((creatorProfiles || []) as DatabaseRow[])
                  .map((profile) => [firstText(profile, ["id"]), profile])
                  .filter(([id]) => Boolean(id)));
              }
            }
            setOperationalUpdates(workRows.map((row) => ({
              ...row,
              _created_by_profile: profilesById[firstText(row, ["created_by", "updated_by", "user_id"])] || null,
            })));
          }
        } finally {
          setOperationalUpdatesLoading(false);
        }
      })();
    }
  };

  const openAlertComplaintReference = (reference: string, alertTickets: Complaint[]) => {
    const complaint = alertTickets.find((ticket) => ticket.reference === reference);
    if (complaint) {
      openComplaintAction(complaint, "view");
    }
  };

  const closeComplaintAction = () => {
    if (savingComplaint || deletingComplaintId) return;
    setSelectedComplaint(null);
    setComplaintAction(null);
    setComplaintActionError("");
  };

  const handleRouteComplaint = async () => {
    if (!selectedComplaint) {
      setRoutingError("Open a complaint before assigning it to a Supervisor or Clerk.");
      return;
    }
    const supervisor = eligibleRoutingUsers.find((person) => firstText(person, ["id"]) === selectedSupervisorId);
    const clerk = eligibleRoutingUsers.find((person) => firstText(person, ["id"]) === selectedClerkId);
    const recipients: DatabaseRow[] = routingMode === "both"
      ? [supervisor, clerk].filter((person): person is DatabaseRow => Boolean(person))
      : routingMode === "supervisor" ? [supervisor].filter((person): person is DatabaseRow => Boolean(person))
      : [clerk].filter((person): person is DatabaseRow => Boolean(person));

    const complaintSectionId = firstText(selectedComplaint.raw, ["section_id", "sectionId"]);
    const complaintDepartmentId = firstText(selectedComplaint.raw, ["department_id", "departmentId"]);
    if (!complaintSectionId) {
      setRoutingError("This complaint has no section ID. Please correct the complaint routing first.");
      return;
    }
    if (routingMode === "both" && (!supervisor || !clerk)) {
      setRoutingError("Select both a Supervisor and a Clerk, or choose one recipient.");
      return;
    }
    if (routingMode === "supervisor" && !supervisor) {
      setRoutingError("Select a Supervisor before continuing.");
      return;
    }
    if (routingMode === "clerk" && !clerk) {
      setRoutingError("Select a Clerk before continuing.");
      return;
    }
    if (recipients.some((person) =>
      firstText(person, ["section_id"]) !== complaintSectionId ||
      (complaintDepartmentId && firstText(person, ["department_id"]) !== complaintDepartmentId)
    )) {
      setRoutingError("The selected Supervisor or Clerk does not belong to this complaint's department and section.");
      return;
    }

    setSavingRouting(true);
    setRoutingError("");
    setRoutingNotice("");
    try {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error(authError?.message || "Your session has expired. Sign in again.");
      const { data: actorProfile, error: actorProfileError } = await supabase
        .from("profiles")
        .select("full_name, username, access_level")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (actorProfileError) throw new Error(`Could not verify your profile: ${actorProfileError.message}`);

      const actorName = loggedInName || firstText(actorProfile || {}, ["full_name", "username"], auth.user.email || "Call Centre Agent");
      const actorRole = loggedInRole || firstText(actorProfile || {}, ["access_level"], "Call Centre Agent");
      const complaintId = firstText(selectedComplaint.raw, ["id", "complaint_id"], selectedComplaint.id);
      if (!complaintId || complaintId.startsWith("complaint-")) throw new Error("This complaint has no valid database ID. Refresh the register and try again.");

      const existingRouting = routingByComplaint[selectedComplaint.id] || [];
      const existingByRole = new Map<string, DatabaseRow>(existingRouting.map((row) => [firstText(row, ["assigned_to_role"]).toLowerCase(), row] as [string, DatabaseRow]));
      const now = new Date().toISOString();
      const rows = recipients.map((person) => {
        const role = firstText(person, ["access_level", "role"], "Supervisor");
        const previous = existingByRole.get(role.toLowerCase());
        return {
          complaint_id: complaintId,
          complaint_reference: selectedComplaint.reference,
          action: previous ? "Reassigned" : "Assigned",
          previous_assignee_id: firstText(previous || {}, ["new_assignee_id"]) || null,
          new_assignee_id: firstText(person, ["id"]),
          assigned_staff_id: null,
          assigned_to_name: firstText(person, ["full_name", "username"], "Municipal user"),
          assigned_to_email: null,
          assigned_to_contact: null,
          assigned_to_role: role,
          assigned_to_department: selectedComplaint.department,
          assigned_to_section: firstText(selectedComplaint.raw, ["section_name", "section"], loggedInSectionName),
          assigned_by: auth.user.id,
          assigned_by_name: actorName,
          assigned_by_role: actorRole,
          assigned_by_email: auth.user.email || "",
          assigned_at: now,
          notes: routingNotesInput.trim() || null,
        };
      });

      const { error: historyError } = await supabase.from("complaint_assignment_history").insert(rows);
      if (historyError) throw new Error(`The Supervisor/Clerk assignment could not be saved: ${historyError.message}`);

      const statusColumn = Object.prototype.hasOwnProperty.call(selectedComplaint.raw, "status") ||
        !Object.keys(selectedComplaint.raw).some((key) => ["status", "complaint_status", "workflow_status"].includes(key))
        ? "status"
        : Object.prototype.hasOwnProperty.call(selectedComplaint.raw, "complaint_status") ? "complaint_status" : "workflow_status";
      const { error: statusError } = await supabase.from("complaints").update({ [statusColumn]: "Assigned" }).eq("id", complaintId);
      if (statusError) throw new Error(`The assignment was saved, but complaint status could not be updated: ${statusError.message}`);

      setRoutingByComplaint((current) => ({
        ...current,
        [selectedComplaint.id]: [...rows, ...(current[selectedComplaint.id] || [])],
      }));
      setComplaints((current) => current.map((item) => item.id === selectedComplaint.id
        ? { ...item, status: "Assigned", raw: { ...item.raw, [statusColumn]: "Assigned" } }
        : item));
      setSelectedComplaint((current) => current
        ? { ...current, status: "Assigned", raw: { ...current.raw, [statusColumn]: "Assigned" } }
        : current);
      const names = recipients.map((person) => firstText(person, ["full_name", "username"], "Municipal user")).join(" and ");
      setRoutingNotice(`Complaint ${selectedComplaint.reference} assigned to ${names}.`);
      setRoutingNotesInput("");
      setActivities((current) => [{
        title: "Complaint routed",
        description: `${selectedComplaint.reference} · routed to ${names} · by ${actorName} (${actorRole})`,
        complaintId: selectedComplaint.id,
        timestamp: Date.now(),
        time: new Date().toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }),
      }, ...current].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10));
    } catch (error) {
      setRoutingError(error instanceof Error ? error.message : "Could not assign this complaint to the Supervisor/Clerk.");
    } finally {
      setSavingRouting(false);
    }
  };

  const handleAssignOfficial = async () => {
    if (!selectedComplaint || !selectedOfficialId) {
      setComplaintActionError("Select an official from your section before assigning this complaint.");
      return;
    }
    if (!loggedInSectionId) {
      setComplaintActionError("Your account has no assigned section. Ask an administrator to update your profile.");
      return;
    }
    const official = eligibleOfficials.find((person) => firstText(person, ["id"]) === selectedOfficialId);
    if (
      !official ||
      firstText(official, ["section_id"]) !== loggedInSectionId ||
      firstText(official, ["is_active"]).toLowerCase() === "false"
    ) {
      setComplaintActionError("Select an active staff member assigned to your section.");
      return;
    }
    setSavingAssignment(true);
    setComplaintActionError("");
    setAssignmentNotice("");
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Your session has expired. Sign in again.");
      const { data: actorProfile, error: actorProfileError } = await supabase.from("profiles").select("full_name, username, email, access_level").eq("id", auth.user.id).maybeSingle();
      if (actorProfileError) throw new Error(`Could not verify the assigning user's profile: ${actorProfileError.message}`);
      const officialName = firstText(official, ["full_name"], "Staff member");
      // loggedInName/loggedInRole are populated from the same authenticated profile
      // used by the header. Prefer them to stale name text from legacy profile rows.
      const actorName = loggedInName || firstText(actorProfile || {}, ["full_name", "username"], auth.user.email || "Municipal user");
      const actorRole = loggedInRole || firstText(actorProfile || {}, ["access_level"], "Staff");
      const raw = selectedComplaint.raw;
      const idKey = ["id", "complaint_id"].find((key) => Object.prototype.hasOwnProperty.call(raw, key)) || "id";
      const oldAssignment = assignmentByComplaint[selectedComplaint.id] || {};
      const previousStaffId = firstText(oldAssignment, ["assigned_staff_id"]);
      const previousAssignee = previousStaffId || firstText(
        oldAssignment,
        ["new_assignee_id", "assigned_to"],
        firstText(raw, ["assigned_to", "assigned_user_id", "assignee_id"])
      );
      const historyPayload: DatabaseRow = {
        complaint_id: raw[idKey] ?? selectedComplaint.id,
        complaint_reference: selectedComplaint.reference,
        action: previousAssignee ? "Reassigned" : "Assigned",
        // Municipal staff are stored in staff_directory, not auth.users.
        // Keep the legacy auth-user FK fields NULL and use the dedicated staff FKs.
        previous_assigned_staff_id: previousStaffId || null,
        assigned_staff_id: selectedOfficialId,
        previous_assignee_id: null,
        new_assignee_id: null,
        assigned_to_name: officialName,
        assigned_to_email: null,
        assigned_to_contact: firstText(official, ["contact_number"]),
        assigned_to_role: firstText(official, ["designation"], "Municipal staff"),
        assigned_to_department: loggedInDepartmentName,
        assigned_to_section: loggedInSectionName,
        assigned_by: auth.user.id,
        assigned_by_name: actorName,
        assigned_by_role: actorRole,
        assigned_by_email: auth.user.email || "",
        assigned_at: new Date().toISOString(),
        notes: assignmentNotesInput.trim() || null,
      };
      // Save the audit record first so assignment history is not lost.
      const { error: historyError } = await supabase.from("complaint_assignment_history").insert(historyPayload);
      if (historyError) throw new Error(`Assignment history could not be saved: ${historyError.message}`);
      // Do not write a staff_directory UUID into legacy complaint assignee
      // columns: those may reference auth.users. The assignment history is
      // the authoritative staff assignment record.
      const updatePayload: DatabaseRow = {};
      if (Object.prototype.hasOwnProperty.call(raw, "status") || !Object.keys(raw).some((key) => ["status", "complaint_status", "workflow_status"].includes(key))) updatePayload.status = "Assigned";
      else if (Object.prototype.hasOwnProperty.call(raw, "complaint_status")) updatePayload.complaint_status = "Assigned";
      else if (Object.prototype.hasOwnProperty.call(raw, "workflow_status")) updatePayload.workflow_status = "Assigned";
      const { error: complaintUpdateError } = await supabase.from("complaints").update(updatePayload).eq(idKey, raw[idKey] ?? selectedComplaint.id);
      if (complaintUpdateError) throw new Error(`Assignment history was saved, but the complaint record could not be updated: ${complaintUpdateError.message}`);
      const assignmentRecord = { ...historyPayload };
      setAssignmentByComplaint((current) => ({ ...current, [selectedComplaint.id]: assignmentRecord }));
      const nextStatus: ComplaintStatus = "Assigned";
      setComplaints((current) => current.map((item) => item.id === selectedComplaint.id ? { ...item, status: nextStatus, raw: { ...item.raw, ...updatePayload } } : item));
      setSelectedComplaint((current) => current ? { ...current, status: nextStatus, raw: { ...current.raw, ...updatePayload } } : current);
      const assignmentTime = new Date();
      const assignmentAction = previousAssignee ? "Complaint reassigned" : "Complaint assigned";
      setActivities((current) => [{
        title: assignmentAction,
        description: `${selectedComplaint.reference} · ${selectedComplaint.subject} · ${previousAssignee ? "Reassigned to" : "Assigned to"} ${officialName} (${firstText(official, ["designation"], "Designation not recorded")}) · by ${actorName} (${actorRole})${assignmentNotesInput.trim() ? ` · ${assignmentNotesInput.trim()}` : ""}`,
        complaintId: selectedComplaint.id,
        timestamp: assignmentTime.getTime(),
        time: assignmentTime.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }),
      }, ...current].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10));
      setAssignmentNotice(previousAssignee ? `Successfully reassigned ${selectedComplaint.reference} to ${officialName}.` : `Successfully assigned ${selectedComplaint.reference} to ${officialName}.`);
      setAssignmentNotesInput("");
    } catch (error) {
      setComplaintActionError(error instanceof Error ? error.message : "Could not assign complaint. Check your database permissions and assignment-history columns.");
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleRedirectComplaint = async (assignmentAction: "Assigned" | "Reassigned" = "Assigned") => {
    if (!selectedComplaint) {
      setRedirectError("Open a complaint before assigning its department and section.");
      return;
    }

    const selectedCatalogueSubject = redirectSubject === "Other"
      ? null
      : REDIRECT_COMPLAINT_SUBJECTS.find((item) =>
          item.department === redirectDepartmentName &&
          item.section === redirectSectionName &&
          item.subject === redirectSubject
        );
    const finalSubject = redirectSubject === "Other" ? redirectOtherSubject.trim() : redirectSubject.trim();

    if (!redirectDepartmentName || !redirectSectionName || !finalSubject) {
      setRedirectError("Select a department, section and complaint subject before assigning this complaint.");
      return;
    }
    if (!REDIRECT_DEPARTMENTS.includes(redirectDepartmentName)) {
      setRedirectError("Select a department from the Complaint Capture options.");
      return;
    }
    if (!(REDIRECT_SECTIONS_BY_DEPARTMENT[redirectDepartmentName] || []).includes(redirectSectionName)) {
      setRedirectError("The selected section does not belong to the selected department.");
      return;
    }
    if (redirectSubject !== "Other" && !selectedCatalogueSubject) {
      setRedirectError("Select a complaint subject listed under this department and section in Complaint Capture.");
      return;
    }

    const finalDepartment = selectedCatalogueSubject?.department || redirectDepartmentName;
    const finalSection = selectedCatalogueSubject?.section || redirectSectionName;
    const complaintId = String(selectedComplaint.raw.id || selectedComplaint.id || "").trim();
    if (!complaintId || complaintId.startsWith("complaint-")) {
      setRedirectError("This complaint has no valid database ID. Refresh the complaints register and try again.");
      return;
    }

    setRedirectSaving(true);
    setRedirectError("");
    setRedirectNotice("");
    try {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error(authError?.message || "Your session has expired. Sign in again.");

      const oldDepartment = selectedComplaint.department;
      const oldSection = firstText(selectedComplaint.raw, ["section", "section_name"], "Not assigned");
      const oldSubject = selectedComplaint.subject;
      const currentStatus = String(selectedComplaint.raw.status || selectedComplaint.status);

      // Resolve the destination department and section to their database IDs.
      // The complaint form stores route labels, while Supervisor/Clerk profiles
      // are scoped by department_id and section_id.
      const { data: departmentRows, error: departmentsError } = await supabase
        .from("departments")
        .select("id, name");
      if (departmentsError) throw new Error(`Could not load departments for handover: ${departmentsError.message}`);
      const destinationDepartment = ((departmentRows || []) as DatabaseRow[]).find((row) =>
        normalizeComplaintRouteName(firstText(row, ["name"])) === normalizeComplaintRouteName(finalDepartment)
      );
      const destinationDepartmentId = firstText(destinationDepartment || {}, ["id"]);
      if (!destinationDepartmentId) throw new Error(`Could not find the database record for ${finalDepartment}.`);

      const { data: sectionRows, error: sectionsError } = await supabase
        .from("sections")
        .select("id, name, department_id");
      if (sectionsError) throw new Error(`Could not load sections for handover: ${sectionsError.message}`);
      const destinationSection = ((sectionRows || []) as DatabaseRow[]).find((row) =>
        firstText(row, ["department_id"]) === destinationDepartmentId &&
        normalizeComplaintRouteName(firstText(row, ["name"])) === normalizeComplaintRouteName(finalSection)
      );
      const destinationSectionId = firstText(destinationSection || {}, ["id"]);
      if (!destinationSectionId) throw new Error(`Could not find ${finalSection} under ${finalDepartment}.`);

      // Department/section assignment is independent of staff availability.
      // The Supervisor/Clerk panel is display-only and is never consulted here.

      // Department handover starts a fresh section queue entry. It is NEW and
      // UNASSIGNED until a municipal staff member is explicitly selected.
      const redirectPayload: DatabaseRow = {
        department: finalDepartment,
        department_id: destinationDepartmentId,
        section: finalSection,
        section_id: destinationSectionId,
        subject: finalSubject,
        status: "New",
      };
      // Clear any legacy assignee fields so a previous department's staff member
      // cannot make the redirected complaint appear assigned in the new section.
      ["assigned_staff_id", "assigned_to", "assigned_user_id", "assignee_id", "staff_id", "official_id"].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(selectedComplaint.raw, key)) redirectPayload[key] = null;
      });

      const { data: updatedRow, error: updateError } = await supabase
        .from("complaints")
        .update(redirectPayload)
        .eq("id", complaintId)
        .select("*")
        .maybeSingle();

      if (updateError) throw new Error(`The department assignment could not be saved: ${updateError.message}`);
      if (!updatedRow) throw new Error("The department assignment was not saved. Check the complaints UPDATE policy and confirm you have permission to assign its department.");

      // Record that any previous field-staff assignment ended at handover. This
      // supersedes older assignment-history rows without assigning a new person.
      const { error: unassignHistoryError } = await supabase.from("complaint_assignment_history").insert({
        complaint_id: complaintId,
        complaint_reference: selectedComplaint.reference,
        action: "Unassigned",
        previous_assigned_staff_id: firstText(assignmentByComplaint[selectedComplaint.id] || {}, ["assigned_staff_id"]) || null,
        assigned_staff_id: null,
        previous_assignee_id: null,
        new_assignee_id: null,
        assigned_to_name: "Unassigned",
        assigned_to_email: null,
        assigned_to_contact: null,
        assigned_to_role: "Municipal staff",
        assigned_to_department: finalDepartment,
        assigned_to_section: finalSection,
        assigned_by: auth.user.id,
        assigned_by_name: loggedInName || "Municipal staff",
        assigned_by_role: loggedInRole || "Staff",
        assigned_by_email: auth.user.email || "",
        assigned_at: new Date().toISOString(),
        notes: "Previous staff assignment cleared because the complaint was redirected to a different department/section.",
      });
      if (unassignHistoryError) throw new Error(`The complaint was redirected, but its previous staff assignment could not be cleared: ${unassignHistoryError.message}`);

      setAssignmentByComplaint((current) => ({
        ...current,
        [selectedComplaint.id]: { action: "Unassigned", assigned_staff_id: null, new_assignee_id: null, assigned_to_name: "Unassigned", assigned_to_department: finalDepartment, assigned_to_section: finalSection },
      }));
      setRoutingNotice(`Complaint route saved to ${finalDepartment} / ${finalSection}. Status: New. Staff assignment: Unassigned.`);

      const { error: auditError } = await supabase.from("complaint_updates").insert({
        complaint_id: complaintId,
        updated_by: auth.user.id,
        old_status: currentStatus,
        new_status: currentStatus,
        comment: `DEPARTMENT_SECTION_HANDOVER| Department ${assignmentAction.toLowerCase()} by ${loggedInRole || "staff"} – ${loggedInName}. Previous route: ${oldDepartment} / ${oldSection} / ${oldSubject}. New route: ${finalDepartment} / ${finalSection} / ${finalSubject}.`,
      });

      const updatedComplaint: Complaint = {
        ...selectedComplaint,
        subject: finalSubject,
        department: finalDepartment,
        status: "New",
        raw: { ...selectedComplaint.raw, ...updatedRow, status: "New", assigned_staff_id: null, assigned_to: null, assigned_user_id: null, assignee_id: null, staff_id: null, official_id: null },
      };

      if (isSectionScopedDashboard && normalizeComplaintRouteName(finalSection) !== normalizeComplaintRouteName(loggedInSectionName)) {
        setComplaints((current) => current.filter((item) => item.id !== selectedComplaint.id));
        setSelectedComplaint(null);
        setComplaintAction(null);
      } else {
        setComplaints((current) => current.map((item) => item.id === selectedComplaint.id ? updatedComplaint : item));
        setSelectedComplaint(updatedComplaint);
      }

      const now = new Date();
      setActivities((current) => [{
        title: assignmentAction === "Reassigned" ? "Department reassigned" : "Department assigned",
        description: `${selectedComplaint.reference} · ${oldDepartment} / ${oldSection} / ${oldSubject} → ${finalDepartment} / ${finalSection} / ${finalSubject} · by ${loggedInName} (${loggedInRole})`,
        timestamp: now.getTime(),
        time: now.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }),
        complaintId: selectedComplaint.id,
      }, ...current].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50));

      const routeOutcome = `Successfully redirected complaint ${selectedComplaint.reference} to ${finalDepartment} → ${finalSection}. Status: New. Staff assignment: Unassigned.`;
      setRedirectNotice(auditError
        ? `${routeOutcome} The activity history could not be saved: ${auditError.message}`
        : routeOutcome);
    } catch (error) {
      setRedirectError(error instanceof Error ? error.message : "An unexpected error occurred while assigning the department.");
    } finally {
      setRedirectSaving(false);
    }
  };

  const handleSaveOperationalUpdate = async (saveType: "progress" | "resources" = "progress") => {
    if (savingOperationalUpdate) return;
    if (!canUseOperationalUpdates) {
      setComplaintActionError("Your account does not have permission to record operational updates.");
      return;
    }
    if (!selectedComplaint) {
      setComplaintActionError("Open a complaint before recording an operational update.");
      return;
    }

    const complaintId = String(selectedComplaint.raw?.id || selectedComplaint.id || "").trim();
    if (!complaintId || complaintId.startsWith("complaint-")) {
      setComplaintActionError("The selected complaint has no valid database ID. Refresh the complaints register.");
      return;
    }

    setSavingOperationalUpdate(true);
    setComplaintActionError("");
    setOperationalUpdateNotice("");

    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(`Session check failed: ${authError.message}`);
      if (!authData.user) throw new Error("Your session has expired. Sign in again.");

      const metadata = authData.user.user_metadata || {};
      // Use the identity already resolved from the authenticated profiles row.
      // Auth metadata can be stale or contain a different display name.
      const actorName = String(
        loggedInName && loggedInName !== "Loading user..."
          ? loggedInName
          : [
              metadata.first_name || metadata.firstName || "",
              metadata.surname || metadata.last_name || metadata.lastName || "",
            ].filter(Boolean).join(" ") || metadata.full_name || metadata.name || authData.user.email || "Municipal staff"
      ).trim();
      const actorRole = String(loggedInRole || metadata.access_level || metadata.role || metadata.user_role || "Municipal staff")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
      const actorLabel = `${actorRole} – ${actorName}`;
      const toIso = (value: string) => value ? new Date(value).toISOString() : null;
      const dateTimeLabel = (value: string) => value
        ? new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
        : "";

      // Save the selected complaint status first. This allows staff to move a
      // complaint to Resolved even when the optional operational-history insert
      // is blocked by a separate table policy.
      const statusToDatabase: Record<string, string> = {
        "Assigned": "Assigned",
        "In Progress": "In Progress",
        "Completed": "Completed",
        "Resolved": "Resolved",
      };
      const selectedStatus = String(operationalUpdateStatus);
      const databaseStatus = statusToDatabase[selectedStatus];
      if (!databaseStatus) throw new Error("Select a valid complaint status.");

      const { data: savedComplaintRow, error: statusError } = await supabase
        .from("complaints")
        .update({ status: databaseStatus })
        .eq("id", complaintId)
        .select("id,status")
        .maybeSingle();

      if (statusError) throw new Error(`The complaint status could not be saved: ${statusError.message}`);
      if (!savedComplaintRow) throw new Error("The complaint status was not saved because no complaint row was updated. Check the complaints UPDATE policy and complaint ID.");

      const nextComplaint: Complaint = {
        ...selectedComplaint,
        status: selectedStatus as ComplaintStatus,
        raw: { ...selectedComplaint.raw, id: savedComplaintRow.id, status: savedComplaintRow.status },
      };
      setComplaints((current) => current.map((item) => item.id === selectedComplaint.id ? nextComplaint : item));
      setSelectedComplaint(nextComplaint);

      const messageParts = [
        "Update source: Operational update",
        `Updated by: ${actorLabel}`,
        `Complaint status changed to: ${selectedStatus}`,
        officialFeedbackName.trim() ? `Information provided by: ${officialFeedbackName.trim()}${officialFeedbackDesignation.trim() ? ` (${officialFeedbackDesignation.trim()})` : ""}` : "",
        officialFeedbackContactedAt ? `Information received at: ${dateTimeLabel(officialFeedbackContactedAt)}` : "",
        operationalMessage.trim() ? `Brief note: ${operationalMessage.trim().replace(/\\r?\\n/g, " ")}` : "",
      ].filter(Boolean);

      // Save a dedicated status-transition audit row. Recent Activity reads
      // complaint_updates; complaint_work_updates is reserved for operational
      // notes and is intentionally not used as the status-history source.
      const previousStatus = String(selectedComplaint.raw.status ?? selectedComplaint.status);
      const statusAuditComment = [
        `Updated by: ${actorLabel}.`,
        officialFeedbackName.trim() ? `Information provided by: ${officialFeedbackName.trim()}${officialFeedbackDesignation.trim() ? ` (${officialFeedbackDesignation.trim()})` : ""}.` : "",
        operationalMessage.trim(),
      ].filter(Boolean).join(" ");
      const { data: savedStatusAudit, error: statusAuditError } = await supabase
        .from("complaint_updates")
        .insert({
          complaint_id: complaintId,
          updated_by: authData.user.id,
          old_status: previousStatus,
          new_status: databaseStatus,
          comment: statusAuditComment || `Status changed from ${previousStatus} to ${databaseStatus}.`,
        })
        .select("*")
        .single();

      if (statusAuditError) {
        console.error("Complaint status was saved, but its Recent Activity audit row failed:", statusAuditError.message);
      }

      const workUpdatePayload: DatabaseRow = {
        complaint_id: complaintId,
        complaint_reference: selectedComplaint.reference,
        update_type: operationalUpdateType,
        message: messageParts.join("\\n"),
        resource_status: resourceAvailability,
        resources_needed: resourcesNeeded.trim() || null,
        resource_shortage_reason: resourceShortageReason.trim() || null,
        expected_resources_at: toIso(expectedResourcesAt),
        site_attended: siteAttendance,
        attended_at: toIso(siteAttendedAt),
        assessment_findings: assessmentFindings.trim() || null,
        work_performed: workPerformed.trim() || null,
        delay_reason: delayReason.trim() || null,
        outstanding_work: outstandingWork.trim() || null,
        next_action: nextAction.trim() || null,
        expected_completion_at: expectedCompletionAt.trim()
          ? new Date(Date.now() + Number(expectedCompletionAt) * 60 * 60 * 1000).toISOString()
          : null,
        expected_attendance_at: toIso(expectedAttendanceAt),
        shift_type: "Normal Shift",
        created_by: authData.user.id,
      };

      let updateNotice = saveType === "resources"
        ? `Resources and constraints for complaint ${selectedComplaint.reference} were successfully updated.`
        : `Complaint progress for ${selectedComplaint.reference} was successfully updated. Status: ${selectedStatus}.`;
      if (databaseStatus === "Resolved" && previousStatus !== "Resolved") {
        updateNotice += ` ${(await notifyComplainants({ event: "resolved", ids: [String(complaintId)] })).message}`;
      }
      let savedWorkUpdate: DatabaseRow | null = null;
      // Always persist a work-update activity, even when the user only changes
      // the complaint status and does not enter optional operational notes.
      const { data: savedUpdateRow, error: workUpdateError } = await supabase
        .from("complaint_work_updates")
        .insert(workUpdatePayload)
        .select("*")
        .single();

      if (workUpdateError) {
        updateNotice += ` Status was saved, but the Recent Activity record could not be saved: ${workUpdateError.message}`;
      } else {
        savedWorkUpdate = {
          ...(savedUpdateRow as DatabaseRow),
          _created_by_profile: { id: authData.user.id, full_name: actorName, access_level: actorRole },
        };
        const { data: history, error: historyError } = await supabase
          .from("complaint_work_updates")
          .select("*")
          .eq("complaint_reference", selectedComplaint.reference)
          .order("created_at", { ascending: false });
        if (!historyError) {
          setOperationalUpdates(((history || []) as DatabaseRow[]).map((row) => ({
            ...row,
            _created_by_profile: firstText(row, ["created_by", "updated_by", "user_id"]) === authData.user.id
              ? { id: authData.user.id, full_name: actorName, access_level: actorRole }
              : (row as DatabaseRow)._created_by_profile || null,
          })));
        } else {
          setOperationalUpdates((current) => [savedWorkUpdate!, ...current]);
        }
      }

      if (savedStatusAudit) {
        const auditTime = firstText(savedStatusAudit as DatabaseRow, ["created_at", "updated_at"]) || new Date().toISOString();
        const activityDate = new Date(auditTime);
        const activityDescription = [
          `${selectedComplaint.reference} · ${selectedComplaint.subject}`,
          `${normalizeStatus(previousStatus)} → ${normalizeStatus(databaseStatus)}`,
          statusAuditComment,
          operationalMessage.trim() && operationalMessage.trim() !== statusAuditComment ? operationalMessage.trim() : "",
        ].filter(Boolean).join(" · ");
        setActivities((current) => {
          const nextActivity: Activity = {
            title: `Complaint status changed to ${normalizeStatus(databaseStatus)}`,
            description: activityDescription,
            timestamp: activityDate.getTime(),
            time: activityDate.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }),
          };
          const withoutDuplicate = current.filter((item) =>
            !(item.title === nextActivity.title &&
              item.description === nextActivity.description &&
              item.timestamp === nextActivity.timestamp)
          );
          return [nextActivity, ...withoutDuplicate].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
        });
      }

      if (statusAuditError) {
        updateNotice += ` The complaint status was saved, but Recent Activity could not be recorded: ${statusAuditError.message}`;
      }

      setOperationalUpdateNotice(updateNotice);
      setOperationalMessage("");
      setAssessmentFindings("");
      setWorkPerformed("");
      setDelayReason("");
      setOutstandingWork("");
      setNextAction("");
      setResourcesNeeded("");
      setResourceShortageReason("");
      setExpectedResourcesAt("");
      setExpectedCompletionAt("");
      setOfficialFeedbackContactedAt("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred while saving the operational update.";
      console.error("Operational update save failed:", error);
      setComplaintActionError(message);
    } finally {
      setSavingOperationalUpdate(false);
    }
  };

  const handleSaveComplaint = async () => {
    if (savingComplaint) return;
    if (!selectedComplaint) {
      setComplaintActionError("Select a complaint before saving.");
      return;
    }
    if (!editSubject.trim()) {
      setComplaintActionError("Complaint subject is required.");
      return;
    }

    setSavingComplaint(true);
    setComplaintActionError("");
    try {
      const supabase = createClient();
      const { data: authResult, error: authError } = await supabase.auth.getUser();
      if (authError || !authResult.user) {
        throw new Error(authError?.message || "Your sign-in session has expired. Sign in again and retry.");
      }

      // complaints.id is the UUID primary key returned by the complaints query.
      const complaintId = String(selectedComplaint.raw.id ?? selectedComplaint.id ?? "").trim();
      if (!complaintId || complaintId.startsWith("complaint-")) {
        throw new Error("The selected complaint does not have a valid complaints.id. Refresh the register and try again.");
      }

      // The dashboard labels are intentionally simple; these are the exact values
      // allowed by the database CHECK constraint supplied for this project.
      const statusToDatabase: Record<string, string> = {
        "Received": "New",
        "In Progress": "In Progress",
        "Resolved": "Resolved",
      };
      const databaseStatus = statusToDatabase[editStatus] || "New";
      const oldDatabaseStatus = String(selectedComplaint.raw.status ?? "New");
      const payload: DatabaseRow = {
        subject: editSubject.trim(),
        status: databaseStatus,
      };

      const descriptionKey = ["description", "details", "complaint_description", "issue_description", "narrative"]
        .find((key) => Object.prototype.hasOwnProperty.call(selectedComplaint.raw, key));
      if (descriptionKey) payload[descriptionKey] = editDescription.trim();

      const departmentIdKey = ["department_id", "departmentId"]
        .find((key) => Object.prototype.hasOwnProperty.call(selectedComplaint.raw, key));
      if (editDepartment.trim() && editDepartment.trim() !== selectedComplaint.department) {
        if (!departmentIdKey) throw new Error("This complaint has no department_id field, so its department cannot be changed here.");
        const { data: departmentRows, error: departmentError } = await supabase.from("departments").select("*");
        if (departmentError) throw new Error(`Could not load departments: ${departmentError.message}`);
        const match = ((departmentRows || []) as DatabaseRow[]).find((row) =>
          firstText(row, ["name", "department_name", "title", "directorate_name"]).trim().toLowerCase() === editDepartment.trim().toLowerCase()
        );
        const matchedId = match?.id ?? match?.department_id;
        if (!matchedId) throw new Error(`Department "${editDepartment}" could not be found.`);
        payload[departmentIdKey!] = matchedId;
      }

      const { data: updatedRow, error: updateError } = await supabase
        .from("complaints")
        .update(payload)
        .eq("id", complaintId)
        .select("id, subject, status")
        .single();
      if (updateError) throw new Error(`Supabase could not update this complaint: ${updateError.message}`);
      if (!updatedRow) throw new Error("Supabase did not return the updated complaint. Check the complaints UPDATE and SELECT policies.");

      // Keep the complaint update successful even if the separate audit insert
      // is blocked; report that audit issue clearly rather than misreporting save.
      const auditComment = `Complaint edited by ${loggedInName || authResult.user.email || "staff member"}. Subject: ${editSubject.trim()}`;
      const { error: auditError } = await supabase.from("complaint_updates").insert({
        complaint_id: complaintId,
        updated_by: authResult.user.id,
        old_status: oldDatabaseStatus,
        new_status: databaseStatus,
        comment: auditComment,
        created_at: new Date().toISOString(),
      });

      const savedComplaint: Complaint = {
        ...selectedComplaint,
        subject: String(updatedRow.subject ?? editSubject.trim()),
        status: normalizeStatus(String(updatedRow.status ?? databaseStatus)),
        department: editDepartment.trim() || selectedComplaint.department,
        raw: { ...selectedComplaint.raw, ...payload, id: complaintId, status: String(updatedRow.status ?? databaseStatus), subject: String(updatedRow.subject ?? editSubject.trim()) },
      };
      setComplaints((current) => current.map((item) => item.id === selectedComplaint.id ? savedComplaint : item));
      setSelectedComplaint(savedComplaint);

      const now = new Date();
      const activity: Activity = {
        title: `Complaint status changed to ${savedComplaint.status}`,
        description: `${selectedComplaint.reference} · ${savedComplaint.subject} · Updated by ${loggedInName || "Call Centre Agent"}`,
        timestamp: now.getTime(),
        time: now.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }),
      };
      setActivities((current) => [activity, ...current].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10));
      setComplaintAction("view");
      const emailResult = databaseStatus === "Resolved" && oldDatabaseStatus !== "Resolved"
        ? await notifyComplainants({ event: "resolved", ids: [String(complaintId)] })
        : null;
      setComplaintActionError([
        auditError ? `Complaint saved successfully, but its Recent Activity entry could not be saved: ${auditError.message}` : "",
        emailResult && !emailResult.ok ? emailResult.message : "",
      ].filter(Boolean).join(" "));
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred while saving.";
      console.error("Complaint save failed:", error);
      setComplaintActionError(message);
    } finally {
      setSavingComplaint(false);
    }
  };

  const handleDeleteComplaint = async (complaint: Complaint) => {
    if (["supervisor", "departmental supervisor", "clerk"].includes(loggedInRole.trim().toLowerCase())) {
      setComplaintActionError("You do not have permission to delete complaints.");
      return;
    }
    const confirmed = window.confirm(`Delete complaint ${complaint.reference}? This action cannot be undone.`);
    if (!confirmed) return;
    setDeletingComplaintId(complaint.id);
    setComplaintActionError("");
    try {
      const supabase = createClient();
      const raw = complaint.raw;
      const idKey = ["id", "complaint_id"].find((key) => Object.prototype.hasOwnProperty.call(raw, key)) || "id";
      const complaintId = raw[idKey] ?? complaint.id;

      if (!complaintId || String(complaintId).startsWith("complaint-")) {
        throw new Error("This complaint does not have a valid database ID, so it cannot be deleted. Refresh the dashboard and try again.");
      }

      // Request the deleted row back. Supabase can return no error but delete zero
      // rows when the current user's RLS policy does not permit deletion.
      const { data: deletedRows, error } = await supabase
        .from("complaints")
        .delete()
        .eq(idKey, complaintId)
        .select(idKey);

      if (error) throw error;
      if (!deletedRows || deletedRows.length === 0) {
        throw new Error("The complaint was not deleted. Your account may not have permission under the Supabase complaints DELETE policy, or the complaint ID could not be matched. Ask an administrator to check the DELETE policy for your role.");
      }

      // Write a durable audit record so the deletion remains in Recent Activity
      // after refresh, even though the original complaints row no longer exists.
      const { data: authData } = await supabase.auth.getUser();
      const { error: auditError } = await supabase.from("complaint_deletion_activity").insert({
        complaint_id: String(complaintId),
        complaint_reference: complaint.reference,
        complaint_subject: complaint.subject,
        department_id: firstText(raw, ["department_id", "departmentId"]) || null,
        section_id: firstText(raw, ["section_id", "sectionId"]) || null,
        deleted_by: authData.user?.id ?? null,
        deleted_by_name: loggedInName,
        deleted_at: new Date().toISOString(),
      });
      if (auditError) {
        console.error("Complaint was deleted, but its audit activity could not be saved:", auditError.message);
      }

      // Update the visible dashboard immediately after Supabase confirms deletion.
      const deletedAt = new Date();
      setComplaints((current) => current.filter((item) => item.id !== complaint.id));
      setActivities((current) => [{
        title: "Complaint deleted",
        description: `${complaint.reference} · ${complaint.subject} · Deleted by ${loggedInName}`,
        timestamp: deletedAt.getTime(),
        time: deletedAt.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }),
      }, ...current].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50));
      setSelectedComplaint((current) => current?.id === complaint.id ? null : current);
      setComplaintActionError("");
      window.alert(`Complaint ${complaint.reference} was deleted successfully.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete complaint. Please try again.";
      setComplaintActionError(message);
      window.alert(`Unable to delete complaint: ${message}`);
    } finally {
      setDeletingComplaintId(null);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        window.alert(`Unable to sign out: ${error instanceof Error ? error.message : "Unknown error"}`);
        setSigningOut(false);
        return;
      }
      window.location.assign("/login");
    } catch (error) {
      console.error("Sign-out failed:", error);
      window.alert("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  };
  const userInitials =
    loggedInName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "U";
  const todayString = today?.toDateString();
  const total = complaints.length;
  const assignedOfficialFor = (complaint: Complaint) => {
    const assignment = assignmentByComplaint[complaint.id] || {};
    return firstText(assignment, ["assigned_to_name", "assignee_name", "official_name", "new_assignee_name"],
      firstText(complaint.raw, ["assigned_to_name", "assignee_name", "official_name"], "Not assigned"));
  };

  // Assignment is determined from the latest assignment-history row first,
  // with legacy assignment fields on the complaint as a fallback.
  const isComplaintAssigned = (complaint: Complaint) => {
    const assignment = assignmentByComplaint[complaint.id] || {};
    const assignedId = firstText(assignment, [
      "assigned_staff_id", "new_assignee_id", "assigned_to", "assigned_user_id",
      "staff_id", "assignee_id", "official_id",
    ]);
    const assignedName = assignedOfficialFor(complaint);
    const rawAssignedId = firstText(complaint.raw, [
      "assigned_staff_id", "assigned_to", "assigned_user_id", "staff_id",
      "assignee_id", "official_id",
    ]);
    const normalizedName = assignedName.trim().toLowerCase();
    return Boolean(assignedId || rawAssignedId ||
      (normalizedName && normalizedName !== "not assigned" && normalizedName !== "unassigned"));
  };

  // The complaint workflow status is authoritative once work has started.
  // Assignment history only promotes a newly received complaint to Assigned;
  // it must never overwrite In Progress or Completed/Resolved.
  const displayComplaintStatus = (complaint: Complaint): ComplaintStatus => {
    if (["In Progress", "Resolved", "Completed"].includes(complaint.status)) {
      return complaint.status;
    }
    return isComplaintAssigned(complaint) ? "Assigned" : complaint.status;
  };

  // Dashboard overview: new, assigned, in progress and completed.
  const newComplaints = complaints.filter((c) => displayComplaintStatus(c) === "New").length;
  const assigned = complaints.filter((c) => isComplaintAssigned(c)).length;
  const unassigned = complaints.filter((c) => !isComplaintAssigned(c)).length;
  const inProgress = complaints.filter((c) => ["In Progress", "In Process"].includes(displayComplaintStatus(c))).length;
  const completed = complaints.filter((c) => ["Resolved", "Completed"].includes(displayComplaintStatus(c))).length;
  
  const actualRepeatedIssueAlerts: {
    key: string;
    area: string;
    ward: string;
    issue: string;
    alertDate: string;
    count: number;
    references: string[];
    tickets: Complaint[];
  }[] = (() => {
    type AlertGroup = {
      key: string;
      area: string;
      ward: string;
      issue: string;
      alertDate: string;
      count: number;
      references: string[];
      tickets: Complaint[];
    };

    const groups = new Map<string, AlertGroup>();

    complaints.forEach((complaint) => {
      const area = getComplaintArea(complaint.raw) || "Multiple areas";
      const ward = getComplaintWard(complaint.raw).trim();

      if (!ward || normalizeAlertKey(ward) === "not recorded") return;

      const issue =
        getComplaintIssue(complaint.raw, complaint.subject) ||
        complaint.subject;
      const issueKey = normalizeAlertKey(issue);

      if (!issueKey || issueKey === "not recorded") return;

      // Keep alerts separate by the date the complaint entered the system.
      const capturedAt = complaintDashboardDate(complaint.raw);
      if (!capturedAt) return;

      const alertDate = [
        capturedAt.getFullYear(),
        String(capturedAt.getMonth() + 1).padStart(2, "0"),
        String(capturedAt.getDate()).padStart(2, "0"),
      ].join("-");

      // Alert identity: ward + issue + capture date.
      const key = [
        "ward",
        normalizeAlertKey(ward),
        "issue",
        issueKey,
        "date",
        alertDate,
      ].join("::");

      const existing = groups.get(key);

      if (existing) {
        existing.count += 1;

        if (existing.references.length < 5) {
          existing.references.push(complaint.reference);
        }

        if (
          existing.area === "Multiple areas" &&
          area !== "Multiple areas"
        ) {
          existing.area = area;
        }

        existing.tickets.push(complaint);
      } else {
        groups.set(key, {
          key,
          area,
          ward,
          issue,
          alertDate,
          count: 1,
          references: [complaint.reference],
          tickets: [complaint],
        });
      }
    });

    return Array.from(groups.values())
      .filter((group) => group.count >= 3)
      .sort(
        (a, b) =>
          b.alertDate.localeCompare(a.alertDate) ||
          b.count - a.count
      );
  })();
  // Keep unacknowledged alerts at the top. Once a councillor is marked alerted,
  // move that issue into the highlighted follow-up queue without clearing its alert status.
  const repeatedIssueAlerts = [...actualRepeatedIssueAlerts].sort((a, b) => {
    const alertedA = Boolean(councillorAlertedAt[a.key]); const alertedB = Boolean(councillorAlertedAt[b.key]);
    if (alertedA !== alertedB) return alertedA ? 1 : -1;
    return b.count - a.count;
  });
  // File repeated-complaint alerts under the date the latest complaint in each
  // alert was captured, matching the date-grouped Complaints Register.
  const repeatedAlertDateGroups = (() => {
    const groups = new Map<string, typeof repeatedIssueAlerts>();
    repeatedIssueAlerts.forEach((alert) => {
      const latestDate = alert.tickets
        .map((ticket) => complaintDashboardDate(ticket.raw))
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      const key = latestDate
        ? `${latestDate.getFullYear()}-${String(latestDate.getMonth() + 1).padStart(2, "0")}-${String(latestDate.getDate()).padStart(2, "0")}`
        : "undated";
      groups.set(key, [...(groups.get(key) || []), alert]);
    });
    return Array.from(groups.entries()).map(([key, alerts]) => ({
      key,
      label: key === "undated" ? "Date not recorded" : new Date(`${key}T12:00:00`).toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }),
      alerts: alerts.sort((a, b) => b.count - a.count),
    })).sort((a, b) => a.key === "undated" ? 1 : b.key === "undated" ? -1 : b.key.localeCompare(a.key));
  })();
  // Hide only the complaint records included in a qualifying bulk alert.
  // Other issues in the same ward remain visible in the individual register.
  const bulkAlertComplaintIds = new Set(
    actualRepeatedIssueAlerts.flatMap((alert) =>
      alert.tickets.map((ticket) => ticket.id)
    )
  );
  const nonAlertComplaints = complaints.filter(
    (complaint) => !bulkAlertComplaintIds.has(complaint.id)
  );
  const normalizedDashboardRole = loggedInRole.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const isSupervisorDashboard = isSupervisorAccount || ["supervisor", "departmental supervisor", "department supervisor", "call centre agent supervisor", "call center agent supervisor", "clerk"].includes(normalizedDashboardRole);
  // Operational updates are available to Call Centre Agents, Supervisors and Clerks.
  const isSectionScopedDashboard = ["supervisor", "departmental supervisor", "department supervisor", "clerk", "official", "department manager", "municipal official"].includes(normalizedDashboardRole);

  // Match saved bulk dispatches to an alert using its key first. Older dispatch
  // records may have been saved with a slightly different alert-key format, so
  // fall back to the ward plus complaint references. Newest dispatch is current.
  const getDispatchesForAlert = (alert: { key: string; ward: string; references: string[]; tickets: Complaint[] }) => {
    const alertReferences = new Set(alert.tickets.map((ticket) => ticket.reference).filter(Boolean));
    const matched = bulkTeamDispatches.filter((dispatch) => {
      if (firstText(dispatch, ["alert_key"]) === alert.key) return true;
      const dispatchWard = normalizeAlertKey(firstText(dispatch, ["ward"]));
      if (!dispatchWard || dispatchWard !== normalizeAlertKey(alert.ward)) return false;
      const dispatchReferences = Array.isArray(dispatch.complaint_references)
        ? (dispatch.complaint_references as unknown[]).map(String)
        : [];
      return dispatchReferences.some((reference) => alertReferences.has(reference));
    });
    return matched.sort((a, b) => {
      const aTime = new Date(firstText(a, ["created_at", "updated_at"])).getTime() || 0;
      const bTime = new Date(firstText(b, ["created_at", "updated_at"])).getTime() || 0;
      return bTime - aTime;
    });
  };
  const supervisorQueueComplaints = nonAlertComplaints.filter((complaint) => {
    const query = complaintSearch.trim().toLowerCase();
    const matchesSearch = !query || [complaint.reference, complaint.subject, complaint.department, getComplaintWard(complaint.raw)]
      .some((value) => value.toLowerCase().includes(query));
    const matchesStatus = complaintStatusFilter === "All" || (complaintStatusFilter === "Unassigned" ? !isComplaintAssigned(complaint) : displayComplaintStatus(complaint) === complaintStatusFilter);
    return matchesSearch && matchesStatus;
  });
  const dateLabel = today?.toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }) ?? "";
  return (
    <main className="min-h-screen bg-[#f5f7f4] text-slate-900">
      {dataError && (
        <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-md rounded-xl border border-amber-200 bg-white p-4 text-sm text-amber-900 shadow-lg">
          <p className="font-bold">Dashboard data could not fully load</p>
          <p className="mt-1 break-words">{dataError}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-lg bg-green-800 px-3 py-2 text-xs font-bold text-white hover:bg-green-900">Retry</button>
        </div>
      )}
      {dataLoading && (
        <div className="sr-only" role="status">Loading dashboard data from Supabase...</div>
      )}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden"
        />
      )}
      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-slate-200 bg-white shadow-sm transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        {/* MUNICIPAL BRANDING */}
        <div className="relative border-b border-slate-100 bg-gradient-to-br from-white via-white to-green-50/80 px-4 pb-4 pt-4">
          <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-green-900 via-green-700 to-[#F2C94C]" />
          <div className="flex items-center gap-3">
            <div className="relative flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-2xl border border-green-900/10 bg-white p-2 shadow-sm">
              <img
                src="/Emalahleni%20Logo.png"
                alt="Emalahleni Local Municipality logo"
                className="h-full w-full object-contain"
              />
              <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-[#F2C94C]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-green-800">
                Mpumalanga
              </p>
              <h2 className="mt-1 text-[16px] font-black leading-tight tracking-tight text-slate-950">
                EMALAHLENI
              </h2>
              <p className="mt-1 text-[10px] font-semibold text-slate-600">
                Local Municipality
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="h-[3px] w-6 rounded-full bg-green-800" />
                <span className="h-[3px] w-3 rounded-full bg-[#F2C94C]" />
                <span className="ml-1 text-[9px] text-slate-400">
                  Serving our community
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-green-50 hover:text-green-800 lg:hidden"
            >
              <Icon name="close" />
            </button>
          </div>
        </div>
        {/* NAVIGATION */}
        <nav className="flex-1 overflow-y-auto bg-[#14532d] px-3 py-5 text-white">
          <div className="mb-3 flex items-center justify-between px-3">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE082]">
              MAIN MENU
            </span>
            <span className="text-[9px] font-semibold text-white/50">01</span>
          </div>
          <div className="space-y-1">
            {mainNavigation
              .filter((item) => {
                if (isAdministratorAccount) return true;
                if (isSupervisorAccount) return ["/dashboard", "/reports"].includes(item.href);
                if (isCallCentreAgentAccount) {
                  return [
                    "/dashboard",
                    "/complaints",
                    "/departments",
                    "/reports",
                  ].includes(item.href);
                }
                return item.href === "/dashboard" || allowedPages.some(
                  (page) => normalizePagePermission(page) === normalizePagePermission(item.label)
                );
              })
              .map((item) => (
                <NavItem
                  key={item.href}
                  {...item}
                  active={item.href === "/dashboard"}
                  onNavigate={() => setSidebarOpen(false)}
                />
              ))}
          </div>
          {(isAdministratorAccount || isSupervisorAccount || isCallCentreAgentAccount) && permissionsLoaded && (
            <>
              <div className="mb-3 mt-7 flex items-center justify-between px-3">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#FFE082]">
                  {isAdministratorAccount ? "USER MANAGEMENT" : "MANAGEMENT"}
                </span>
                <span className="text-[9px] font-semibold text-white/50">02</span>
              </div>
              <div className="space-y-1">
                {(isAdministratorAccount
                  ? adminNavigation
                  : isCallCentreAgentAccount
                    ? callCentreManagementNavigation
                    : supervisorManagementNavigation
                ).map((item) => (
                  <NavItem
                    key={item.href}
                    {...item}
                    onNavigate={() => setSidebarOpen(false)}
                  />
                ))}
              </div>
            </>
          )}
        </nav>
        {/* USER PROFILE */}
        <div className="border-t border-white/15 bg-[#14532d] p-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/10 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F2C94C] text-[11px] font-extrabold text-green-950">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">
                {loggedInName}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-green-100/70">
                {loggedInEmail || "Authenticated account"}
              </p>
            </div>
            <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" title="Signed in" />
          </div>
        </div>
      </aside>
      {/* MAIN CONTENT */}
      <div className="min-h-screen lg:pl-[264px]">
        {/* HEADER */}
        <header className="sticky top-0 z-30 flex min-h-[70px] items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 shadow-sm backdrop-blur sm:px-6 xl:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-green-50 lg:hidden"
            >
              <Icon name="menu" />
            </button>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-green-800">
                Complaints Management System
              </p>
              <h1 className="mt-1 truncate text-xl font-extrabold tracking-tight text-slate-900">
                {["supervisor", "official", "department manager", "departmental supervisor", "municipal official"].includes(loggedInRole.toLowerCase())
                  ? `${loggedInSectionName || "Assigned Section"} Dashboard`
                  : "Dashboard"}
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500 sm:flex">
              <Icon name="calendar" />
              <span>{dateLabel}</span>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                aria-label="Open account menu"
                className="flex max-w-[230px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-left transition hover:border-green-300 hover:bg-green-50/50 focus:outline-none focus:ring-2 focus:ring-green-700/20 sm:px-3"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-800 text-[10px] font-bold text-white">
                  {userInitials}
                </span>
                <span className="hidden min-w-0 md:block">
                  <span className="block max-w-[160px] truncate text-[11px] font-bold text-slate-800">
                    {loggedInName}
                  </span>
                  <span className="block max-w-[160px] truncate text-[10px] text-slate-500">
                    {loggedInEmail}
                  </span>
                </span>
                <span aria-hidden="true" className="text-xs text-slate-500">{profileMenuOpen ? "▴" : "▾"}</span>
              </button>
              {profileMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close account menu"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setProfileMenuOpen(false)}
                  />
                  <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                    <div className="border-b border-slate-100 px-3 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Signed-in account</p>
                      <p className="mt-1 break-words text-sm font-bold text-slate-800">{loggedInName}</p>
                      <p className="mt-1 break-all text-xs text-slate-500">{loggedInEmail}</p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        void handleSignOut();
                      }}
                      disabled={signingOut}
                      className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span aria-hidden="true">↪</span>
                      {signingOut ? "Signing out..." : "Sign out"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 xl:px-8">
          {/* WELCOME BANNER */}
          <section className="relative mb-7 overflow-hidden rounded-2xl bg-gradient-to-br from-[#124b2b] via-[#176438] to-[#0f3922] px-5 py-6 text-white shadow-lg shadow-green-950/10 sm:px-7 sm:py-7">
            <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full border-[28px] border-white/[0.05]" />
            <div className="pointer-events-none absolute -bottom-24 right-[20%] h-48 w-48 rounded-full border-[22px] border-[#FFE082]/[0.07]" />
            <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
              <div className="max-w-2xl">
                <div aria-hidden="true" className="mb-1 flex items-center gap-1.5">
                  <span className="h-[3px] w-12 rounded-full bg-[#F2C94C]" />
                  <span className="h-[3px] w-5 rounded-full bg-white/70" />
                </div>
                <h2 className="mt-3 text-2xl font-light leading-tight tracking-tight sm:text-3xl">
                  Capture every complaint.
                  <br />
                  <span className="font-extrabold text-[#FFE082]">Track every step.</span>
                </h2>
                <p className="mt-3 max-w-xl text-xs leading-6 text-green-50/80 sm:text-sm">
                  Record community concerns in one place, monitor departmental
                  assignments and follow every request through to resolution.
                </p>
              </div>
              <div className="relative flex min-w-[170px] items-center gap-3 rounded-xl border border-white/25 bg-white/10 px-4 py-3 shadow-sm backdrop-blur-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFE082] text-[#14532d]">
                  <Icon name="complaints" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-green-50/80">Total complaints</span>
                  <span className="mt-0.5 block text-2xl font-extrabold leading-none text-white tabular-nums">{total}</span>
                </span>
              </div>
            </div>
          </section>
          {/* COMPLAINT OVERVIEW */}
          <section className="mb-8">
            <SectionHeading
              eyebrow=""
              title="Complaints"
              description="complaint register."
            />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                title="New"
                value={newComplaints}
                description="New complaints"
                icon="complaints"
                tone="green"
              />
              <SummaryCard
                title="Assigned"
                value={assigned}
                description="Complaints assigned to municipal teams"
                icon="users"
                tone="yellow"
              />
              <SummaryCard
                title="Unassigned"
                value={unassigned}
                description="Complaints awaiting assignment to a team member"
                icon="clock"
                tone="blue"
              />
              <SummaryCard
                title="In progress"
                value={inProgress}
                description="Currently being handled"
                icon="clock"
                tone="blue"
              />
              <SummaryCard
                title="Completed"
                value={completed}
                description="Work completed by the assigned team"
                icon="bell"
                tone="yellow"
              />
            </div>
          </section>
          {/* Compact, expandable ward alerts. The oversized green banner is intentionally removed. */}
          <section aria-labelledby="community-issue-alerts-heading" className="mb-5 overflow-hidden rounded-xl border border-red-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setShowCommunityAlerts((current) => !current)}
              aria-expanded={showCommunityAlerts}
              aria-controls="community-issue-alerts-content"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-red-50/70"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2h16a1.4 1.4 0 0 0 1.2-2L12 3Z"/><path d="M12 9v4m0 3h.01"/></svg>
                </span>
                <span className="min-w-0">
                  <span id="community-issue-alerts-heading" className="block text-sm font-bold text-slate-900">Community Issue Alerts</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{showCommunityAlerts ? "Collapse" : "Expand"}</span>
                </span>
                <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-extrabold text-red-700">{repeatedIssueAlerts.length}</span>
              </span>
              <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${showCommunityAlerts ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            {showCommunityAlerts && (
              <div id="community-issue-alerts-content" className="border-t border-red-100">
                {repeatedIssueAlerts.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-slate-500">There are currently no active ward alerts.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {repeatedAlertDateGroups.map((dateGroup) => (
                      <section key={`alert-date-${dateGroup.key}`} aria-label={`Complaint alerts for ${dateGroup.label}`}>
                        <div className="border-y border-slate-200 bg-slate-50 px-4 py-2.5">
                          <button type="button" onClick={() => setCollapsedDateGroups((current) => ({ ...current, [`alert:${dateGroup.key}`]: !current[`alert:${dateGroup.key}`] }))} aria-expanded={!collapsedDateGroups[`alert:${dateGroup.key}`]} aria-controls={`alert-items-${dateGroup.key}`} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
                            <span className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-700"><span aria-hidden="true">{collapsedDateGroups[`alert:${dateGroup.key}`] ? "▸" : "▾"}</span>{dateGroup.label}</span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{dateGroup.alerts.length} {dateGroup.alerts.length === 1 ? "alert" : "alerts"}</span>
                          </button>
                        </div>
                        {!collapsedDateGroups[`alert:${dateGroup.key}`] && <div id={`alert-items-${dateGroup.key}`}>
                    {dateGroup.alerts.map((alert) => (
                      <div key={`compact-alert-${alert.key}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-extrabold text-slate-900">Ward {alert.ward}</span>
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">{alert.count} complaints</span>
                            {councillorAlertedAt[alert.key] && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Councillor alerted</span>}
                          </div>
                          <p className="mt-1 text-xs text-slate-600">{alert.issue}</p>
                          {!councillorAlertedAt[alert.key] ? (
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                              <div className="flex min-w-0 items-start gap-2">
                                <span className="mt-0.5 text-amber-700" aria-hidden="true">⚠</span>
                                <div>
                                  <p className="text-xs font-extrabold text-amber-950">COUNCILLOR NOTIFICATION REQUIRED</p>
                                  <p className="mt-0.5 text-[11px] leading-4 text-amber-800">The councillor for Ward {alert.ward} must be notified about these repeated complaints.</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void recordCouncillorAlerted(alert.key)}
                                className="shrink-0 rounded-lg border border-amber-500 bg-amber-600 px-3 py-2 text-[11px] font-extrabold text-white transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                              >Mark councillor as notified</button>
                            </div>
                          ) : (
                            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                              <p className="text-xs font-extrabold text-emerald-900">COUNCILLOR NOTIFICATION RECORDED</p>
                              <p className="mt-0.5 text-[11px] text-emerald-800">Marked as notified on {new Date(councillorAlertedAt[alert.key]).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}.</p>
                            </div>
                          )}
                          <div className="mt-2">
                            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Complaint references — select to view details</p>
                            <div className="flex flex-wrap gap-1.5">
                              {alert.references.map((reference) => (
                                <button
                                  key={`${alert.key}-${reference}`}
                                  type="button"
                                  onClick={() => openAlertComplaintReference(reference, alert.tickets)}
                                  title={`View complaint ${reference}`}
                                  className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-[10px] font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 transition hover:border-emerald-500 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1"
                                >
                                  {reference}
                                </button>
                              ))}
                              {alert.count > alert.references.length && (
                                <span className="self-center text-[10px] text-slate-500">
                                  and {alert.count - alert.references.length} more
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button type="button" onClick={() => setExpandedAlertKeys((current) => ({ ...current, [alert.key]: !current[alert.key] }))} aria-expanded={Boolean(expandedAlertKeys[alert.key])} className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-800 transition hover:bg-red-50">{expandedAlertKeys[alert.key] ? "Hide" : "View"}</button>
                        {expandedAlertKeys[alert.key] && (
                          <div className="w-full rounded-xl border border-red-100 bg-red-50/40 p-3">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <h3 className="text-xs font-extrabold text-slate-900">Ward {alert.ward} — bulk complaint alert</h3>
                              <span className="text-[10px] font-semibold text-slate-500">{alert.count} related complaints</span>
                            </div>
                            {(isCallCentreAgentAccount || isSupervisorDashboard) && (
                              <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <h4 className="text-xs font-extrabold text-green-950">Bulk update all complaints</h4>
                                    <p className="mt-1 text-[11px] leading-5 text-green-900">Record shared resources and constraints for all {alert.tickets.length} complaints in this repeated-issue alert.</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedBulkAlertPanels((current) => ({ ...current, [alert.key]: !current[alert.key] }))}
                                    aria-expanded={Boolean(expandedBulkAlertPanels[alert.key])}
                                    className="shrink-0 rounded-lg border border-green-300 bg-white px-3 py-2 text-xs font-bold text-green-900 transition hover:bg-green-100"
                                  >
                                    {expandedBulkAlertPanels[alert.key] ? "Collapse" : "Expand"}
                                  </button>
                                </div>
                                {expandedBulkAlertPanels[alert.key] && (
                                <>
                                {isCallCentreAgentAccount && !isSupervisorDashboard && <>
                                  <p className="mt-3 text-[11px] leading-5 text-green-900">You can also apply one status update to all complaints. Each complaint receives its own audit-history entry.</p>
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-green-900">New status</span><select value={bulkComplaintStatus} onChange={(event) => setBulkComplaintStatus(event.target.value as ComplaintStatus)} className="h-10 w-full rounded-lg border border-green-200 bg-white px-3 text-xs font-semibold text-slate-800"><option value="Resolved">Resolved</option><option value="In Progress">In Progress</option><option value="New">New</option>
                  <option value="Unassigned">Unassigned</option></select></label>
                                    <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-green-900">Shared update note (optional)</span><input value={bulkComplaintNote} onChange={(event) => setBulkComplaintNote(event.target.value)} placeholder="e.g. Work completed and issue resolved" className="h-10 w-full rounded-lg border border-green-200 bg-white px-3 text-xs text-slate-800" /></label>
                                  </div>
                                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-green-900">This action affects all complaints included in this ward alert.</span><button type="button" onClick={() => void updateAllAlertComplaints(alert)} disabled={savingBulkComplaintKey === alert.key || alert.tickets.length === 0} className="rounded-lg bg-green-800 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50">{savingBulkComplaintKey === alert.key ? "Updating complaints…" : `Update all ${alert.tickets.length} complaints`}</button></div>
                                  {bulkComplaintNotice[alert.key] && <p role="status" className="mt-2 rounded-lg border border-green-200 bg-white px-3 py-2 text-[11px] font-semibold text-green-950">{bulkComplaintNotice[alert.key]}</p>}
                                </>}
                                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 sm:p-4">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800" aria-hidden="true">⚠</span>
                                      <div><h5 className="text-xs font-extrabold text-slate-900">Resources and constraints</h5><p className="text-[11px] text-slate-600">Record what the teams need to complete the work. This information will be added to every complaint in this alert.</p></div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedBulkResourcePanels((current) => ({ ...current, [alert.key]: !current[alert.key] }))}
                                      aria-expanded={Boolean(expandedBulkResourcePanels[alert.key])}
                                      className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
                                    >
                                      {expandedBulkResourcePanels[alert.key] ? "Collapse" : "Expand"}
                                    </button>
                                  </div>
                                  {expandedBulkResourcePanels[alert.key] && (
                                  <>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Resource availability</span><select value={bulkResourceAvailability} onChange={(event) => setBulkResourceAvailability(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"><option>Not assessed</option><option>Available</option><option>Partially available</option><option>Unavailable</option><option>Awaiting resources</option></select></label>
                                    <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Resources needed</span><input value={bulkResourcesNeeded} onChange={(event) => setBulkResourcesNeeded(event.target.value)} placeholder="e.g. Tipper truck, tools, materials" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800" /></label>
                                    <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Reason resources are delayed (if applicable)</span><input value={bulkResourceShortageReason} onChange={(event) => setBulkResourceShortageReason(event.target.value)} placeholder="Brief reason" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800" /></label>
                                    <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Expected resource availability (optional)</span><input type="datetime-local" value={bulkExpectedResourcesAt} onChange={(event) => setBulkExpectedResourcesAt(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800" /></label>
                                  </div>
                                  </>
                                  )}
                                </div>
                                {expandedBulkResourcePanels[alert.key] && (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[10px] leading-4 text-green-900">Save these resource details separately for every complaint in this alert.</span>
                                  <button type="button" onClick={() => void saveBulkAlertResources(alert)} disabled={savingBulkComplaintKey === alert.key || alert.tickets.length === 0} className="rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-xs font-extrabold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">{savingBulkComplaintKey === alert.key ? "Saving resources…" : `Save resources for all ${alert.tickets.length} complaints`}</button>
                                </div>
                                )}
                                </>
                                )}
                              </div>
                            )}
                            {isSupervisorDashboard ? (
                              <>
                              {getDispatchesForAlert(alert).slice(0, 1).length > 0 && reassigningBulkAlertKey !== alert.key && (
                                <div className="space-y-3">
                                  {getDispatchesForAlert(alert).slice(0, 1).map((dispatch) => {
                                    const dispatchId = firstText(dispatch, ["id", "created_at"]);
                                    const names = Array.isArray(dispatch.team_member_names) ? (dispatch.team_member_names as unknown[]).map(String) : [];
                                    const contacts = Array.isArray(dispatch.team_member_contacts) ? (dispatch.team_member_contacts as unknown[]).map((value) => String(value || "Not provided")) : [];
                                    const refs = Array.isArray(dispatch.complaint_references) ? (dispatch.complaint_references as unknown[]).map(String) : [];
                                    const createdAt = firstText(dispatch, ["created_at"]);
                                    const isEscalated = firstText(dispatch, ["status"]).toLowerCase() === "escalated";
                                    return (
                                      <article key={dispatchId} className="rounded-lg border border-green-200 bg-white p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-extrabold text-green-950">Team dispatched</h4><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${isEscalated ? "bg-red-100 text-red-900" : "bg-green-100 text-green-900"}`}>{firstText(dispatch, ["status"], "Dispatched")}</span></div>
                                        {createdAt && !Number.isNaN(new Date(createdAt).getTime()) && <p className="mt-1 text-[10px] text-slate-500">{new Date(createdAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</p>}
                                        <p className="mt-3 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Dispatched team and contact numbers</p>
                                        <div className="mt-1.5 space-y-1">{names.map((name, index) => { const phone = contacts[index] || "Not provided"; return <div key={`${name}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-2"><span className="text-xs font-semibold text-slate-800">{name}</span>{phone !== "Not provided" ? <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="text-xs font-bold text-green-800 underline">{phone}</a> : <span className="text-[10px] text-slate-500">Contact not recorded</span>}</div>; })}{names.length === 0 && <p className="text-xs text-slate-500">No team members recorded.</p>}</div>
                                        <p className="mt-3 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Supervisor instructions</p><p className="mt-1 whitespace-pre-wrap text-xs text-slate-800">{firstText(dispatch, ["instructions"], "No instructions recorded.")}</p>
                                        <p className="mt-3 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Complaint references — select to view details</p>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                          {(refs.length ? refs : alert.references).map((reference) => (
                                            <button
                                              key={`${dispatchId}-${reference}`}
                                              type="button"
                                              onClick={() => openAlertComplaintReference(reference, alert.tickets)}
                                              title={`View complaint ${reference}`}
                                              className="rounded border border-emerald-200 bg-white px-2 py-1 text-[10px] font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 transition hover:border-emerald-500 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1"
                                            >
                                              {reference}
                                            </button>
                                          ))}
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                                          <button type="button" onClick={() => setReassigningBulkAlertKey(alert.key)} className="rounded-lg border border-green-700 bg-green-50 px-3 py-2 text-[11px] font-extrabold text-green-900 hover:bg-green-100">Reassign team</button>
                                        </div>
                                      </article>
                                    );
                                  })}
                                </div>
                              )}
                              {reassigningBulkAlertKey === alert.key && bulkTeamDispatches.some((dispatch) => firstText(dispatch, ["alert_key"]) === alert.key) && <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2"><p className="text-xs font-bold text-blue-950">Reassigning the ward response team</p><button type="button" onClick={() => setReassigningBulkAlertKey(null)} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-600">Cancel</button></div>}
                              {(getDispatchesForAlert(alert).slice(0, 1).length === 0 || reassigningBulkAlertKey === alert.key) && (
                              <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                                <h4 className="text-sm font-extrabold text-blue-950">Dispatch Team</h4>
                                <p className="mt-1 text-xs leading-5 text-blue-900">Select multiple team members to respond to the ward-wide alert. Select multiple team members to respond to this ward-wide alert.</p>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                  <div className="rounded-lg border border-blue-100 bg-white px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-800">Ward</p><p className="mt-1 text-sm font-extrabold text-blue-950">{alert.ward}</p></div>
                                  <div className="rounded-lg border border-blue-100 bg-white px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-800">Team members selected</p><p className="mt-1 text-sm font-extrabold text-blue-950">{bulkTeamMemberIds.length}</p></div>
                                </div>
                                <div className="mt-3">
                                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-slate-700">Select multiple team members</span>
                                    <span className="text-[10px] font-bold text-blue-800">{bulkTeamMemberIds.length} selected</span>
                                  </div>
                                  {(["day", "standby"] as const).map((group) => {
                                    const people = eligibleOfficials.filter((person) =>
                                      (String(person.standby_available ?? "").toLowerCase() === "true") === (group === "standby")
                                    );
                                    if (people.length === 0) return null;
                                    return (
                                      <div key={group} className="mb-2 overflow-hidden rounded-lg border border-blue-100 bg-white">
                                        <p className="border-b border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-blue-900">
                                          {group === "standby" ? "Standby team" : "Day shift / general team"}
                                        </p>
                                        <div className="space-y-1 p-2">
                                          {people.map((person) => {
                                            const personId = firstText(person, ["id"]);
                                            const personName = firstText(person, ["full_name", "username", "email"], "Staff member");
                                            const isSelected = bulkTeamMemberIds.includes(personId);
                                            return (
                                              <label key={personId} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${isSelected ? "border-blue-400 bg-blue-50" : "border-transparent hover:border-slate-200 hover:bg-slate-50"}`}>
                                                <input
                                                  type="checkbox"
                                                  checked={isSelected}
                                                  onChange={(event) => setBulkTeamMemberIds((current) =>
                                                    event.target.checked
                                                      ? [...current.filter((id) => id !== personId), personId]
                                                      : current.filter((id) => id !== personId)
                                                  )}
                                                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-800 focus:ring-blue-600"
                                                />
                                                <span className="min-w-0 flex-1">
                                                  <span className="block text-xs font-bold text-slate-800">{personName}</span>
                                                  <span className="mt-0.5 block text-[10px] text-slate-500">{firstText(person, ["designation"], "Municipal staff")} · {firstText(person, ["contact_number"], "Contact number not recorded")}</span>
                                                </span>
                                                {isSelected && <span className="text-[10px] font-extrabold text-blue-800">Selected</span>}
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {bulkStaffLoading && <p className="text-xs font-semibold text-blue-800">Loading active staff from your section…</p>}
                                  {!bulkStaffLoading && bulkStaffLoadError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">Staff directory could not be loaded: {bulkStaffLoadError}</p>}
                                  {!bulkStaffLoading && !bulkStaffLoadError && eligibleOfficials.length === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">No active staff members were found in your assigned section. Check the Staff Directory and confirm that staff are active and assigned to your section.</p>}
                                  {bulkTeamMemberIds.length === 0 && eligibleOfficials.length > 0 && <p className="text-[11px] text-slate-500">Tick the checkbox beside each person you want to dispatch. You can select more than one.</p>}
                                </div>
                                {bulkStaffLoading && <p className="mt-2 text-xs font-semibold text-blue-800">Loading active staff from your section…</p>}
                                {!bulkStaffLoading && bulkStaffLoadError && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">Staff directory could not be loaded: {bulkStaffLoadError}</p>}
                                {!bulkStaffLoading && !bulkStaffLoadError && eligibleOfficials.length === 0 && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">No active staff members were found in your assigned section. Check the Staff Directory and confirm that staff are active and assigned to your section.</p>}
                                <div className="mt-2 space-y-1.5">
                                  {bulkTeamMemberIds.map((personId) => { const person = eligibleOfficials.find((item) => firstText(item, ["id"]) === personId); if (!person) return null; const personName = firstText(person, ["full_name", "username", "email"], "Staff member"); return <div key={personId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2"><div><p className="text-xs font-bold text-slate-800">{personName}</p><p className="text-[10px] text-slate-500">{firstText(person, ["designation"], "Municipal staff")} · {firstText(person, ["contact_number"], "Contact number not recorded")}</p></div><button type="button" onClick={() => setBulkTeamMemberIds((current) => current.filter((id) => id !== personId))} className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50">Remove</button></div>; })}
                                  {bulkTeamMemberIds.length === 0 && <p className="rounded-lg border border-dashed border-blue-200 bg-white px-3 py-2 text-xs text-slate-500">No team members selected yet.</p>}
                                </div>
                                <label className="mt-3 block"><span className="mb-1 block text-xs font-bold text-slate-700">Team instructions</span><textarea value={bulkTeamInstructions} onChange={(event) => setBulkTeamInstructions(event.target.value)} rows={3} placeholder="Instructions for the ward response team" className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800" /></label>
                                <button type="button" onClick={() => void dispatchBulkWardTeam(alert)} disabled={savingBulkAlertKey === alert.key || bulkTeamMemberIds.length === 0} className="mt-3 rounded-lg bg-blue-900 px-4 py-2.5 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">{savingBulkAlertKey === alert.key ? "Dispatching team…" : "Dispatch team for this ward"}</button>
                                {bulkDispatchNotice && <p role="status" className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-blue-950">{bulkDispatchNotice}</p>}
                              </div>
                              )}
                              </>

                            ) : (
                              <div className="space-y-2">
                                {getDispatchesForAlert(alert).slice(0, 1).length === 0 ? (
                                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-extrabold text-amber-900">No team dispatched yet</p><p className="mt-1 text-xs leading-5 text-amber-800">The supervisor has not recorded a dispatch for Ward {alert.ward}. Check this alert again later for team details.</p></div>
                                ) : getDispatchesForAlert(alert).slice(0, 1).map((dispatch) => {
                                  const names = Array.isArray(dispatch.team_member_names) ? (dispatch.team_member_names as unknown[]).map(String) : [];
                                  const contacts = Array.isArray(dispatch.team_member_contacts) ? (dispatch.team_member_contacts as unknown[]).map((value) => String(value || "Not provided")) : [];
                                  const refs = Array.isArray(dispatch.complaint_references) ? (dispatch.complaint_references as unknown[]).map(String) : [];
                                  const createdAt = firstText(dispatch, ["created_at"]);
                                  return <article key={firstText(dispatch, ["id", "created_at"])} className="rounded-lg border border-green-200 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-extrabold text-green-950">Team dispatched</h4><span className="rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold text-green-900">{firstText(dispatch, ["status"], "Dispatched")}</span></div>
                                    <p className="mt-1 text-[10px] text-slate-500">{createdAt && !Number.isNaN(new Date(createdAt).getTime()) ? new Date(createdAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "Dispatch time not recorded"}</p>
                                    <p className="mt-3 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Dispatched team and contact numbers</p>
                                    <div className="mt-1.5 space-y-1">{names.map((name, index) => { const phone = contacts[index] || "Not provided"; return <div key={`${name}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-2"><span className="text-xs font-semibold text-slate-800">{name}</span>{phone !== "Not provided" ? <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="text-xs font-bold text-green-800 underline">{phone}</a> : <span className="text-[10px] text-slate-500">Contact not recorded</span>}</div>; })}</div>
                                    <p className="mt-3 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Supervisor instructions</p><p className="mt-1 whitespace-pre-wrap text-xs text-slate-800">{firstText(dispatch, ["instructions"], "No instructions recorded.")}</p>
                                    <p className="mt-3 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Complaint references — select to view details</p>
                                    <div className="mt-1 flex flex-wrap gap-1.5">
                                      {(refs.length ? refs : alert.references).map((reference) => (
                                        <button
                                          key={`${firstText(dispatch, ["id", "created_at"])}-${reference}`}
                                          type="button"
                                          onClick={() => openAlertComplaintReference(reference, alert.tickets)}
                                          title={`View complaint ${reference}`}
                                          className="rounded border border-emerald-200 bg-white px-2 py-1 text-[10px] font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 transition hover:border-emerald-500 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-1"
                                        >
                                          {reference}
                                        </button>
                                      ))}
                                    </div>
                                  </article>;
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                        </div>}
                      </section>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
          {/* Ward alert details, including supervisor dispatch and team contacts, remain in the complaint View panel. */}
          {/* SUPERVISOR COMPLAINT QUEUE */}
          {isSupervisorDashboard && (
            <section aria-labelledby="supervisor-complaint-queue" className="mb-8 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
                <h2 id="supervisor-complaint-queue" className="text-sm font-extrabold tracking-tight text-[#14532d]">Complaint Queue</h2>
                <p className="mt-1 text-[11px] text-slate-500">All complaints routed to {loggedInSectionName || "your assigned section"}. Complaints are grouped by date; open a complaint to view any ward alert and supervisor dispatch updates.</p>
              </div>
              <div className="grid gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-[minmax(0,1fr)_190px] sm:px-6">
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Search complaints</span>
                  <input value={complaintSearch} onChange={(event) => setComplaintSearch(event.target.value)} placeholder="Search reference, subject or ward..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-green-700 focus:ring-2 focus:ring-green-700/10" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Status</span>
                  <select value={complaintStatusFilter} onChange={(event) => setComplaintStatusFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-green-700 focus:ring-2 focus:ring-green-700/10">
                    <option value="All">All statuses</option><option value="New">New</option>
                   <option value="Unassigned">Unassigned</option><option value="Assigned">Assigned</option><option value="In Progress">In progress</option><option value="Resolved">Resolved</option>
                  </select>
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    <tr><TableHeading>Complaint</TableHeading><TableHeading>Date</TableHeading><TableHeading>Ward</TableHeading><TableHeading>Priority</TableHeading><TableHeading>Status</TableHeading><TableHeading>Assigned to</TableHeading><TableHeading>Action</TableHeading></tr>
                  </thead>
                  <tbody>
                    {groupComplaintsByDate(supervisorQueueComplaints).map((group) => (
                      <Fragment key={`supervisor-group-${group.key}`}>
                        <tr key={`supervisor-date-${group.key}`} className="border-t-2 border-slate-200 bg-slate-100/90">
                          <td colSpan={7} className="px-5 py-2.5">
                            <button type="button" onClick={() => setCollapsedDateGroups((current) => ({ ...current, [`supervisor:${group.key}`]: !current[`supervisor:${group.key}`] }))} aria-expanded={!collapsedDateGroups[`supervisor:${group.key}`]} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
                              <span className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-700"><span aria-hidden="true" className="text-sm">{collapsedDateGroups[`supervisor:${group.key}`] ? "▸" : "▾"}</span>{group.label}</span>
                              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{group.complaints.length} {group.complaints.length === 1 ? "complaint" : "complaints"}</span>
                            </button>
                          </td>
                        </tr>
                        {!collapsedDateGroups[`supervisor:${group.key}`] && group.complaints.map((complaint) => {
                      const ward = getComplaintWard(complaint.raw) || "Not recorded";
                      const rawDate = complaint.date ? new Date(complaint.date) : null;
                      const dateText = rawDate && !Number.isNaN(rawDate.getTime()) ? rawDate.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "Not recorded";
                      const isAssigned = assignedOfficialFor(complaint) !== "Not assigned";
                      return (
                        <tr key={complaint.id} className="border-t border-slate-100 transition hover:bg-green-50/40">
                          <td className="min-w-[260px] border-l-4 border-transparent px-5 py-4">
                            <div className="flex flex-wrap items-center gap-2"><p className="font-extrabold text-green-800">{complaint.reference}</p></div>
                            <p className="mt-1 font-semibold text-slate-900">{complaint.subject}</p>
                            <p className="mt-1 line-clamp-1 text-[10px] text-slate-500">{firstText(complaint.raw, ["description", "details", "complaint_description", "issue_description", "narrative"], "No additional description recorded.")}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-slate-600">{dateText}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-slate-600">{ward}</td>
                          <td className="whitespace-nowrap px-3 py-4"><PriorityBadge priority={complaint.priority} /></td>
                          <td className="whitespace-nowrap px-3 py-4"><StatusBadge status={complaint.status} /></td>
                          <td className="max-w-[180px] px-3 py-4 text-slate-600">{assignedOfficialFor(complaint)}</td>
                          <td className="whitespace-nowrap px-3 py-4 pr-5">
                            <div className="flex items-center justify-end gap-2">
                              <button type="button" onClick={() => openComplaintAction(complaint, "view")} className="inline-flex items-center gap-1.5 rounded-lg bg-green-800 px-3 py-2 text-[10px] font-extrabold text-white transition hover:bg-green-900">
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/><path d="M8 12h8M8 9h5"/></svg>
                                View Details
                              </button>
                              <button type="button" onClick={() => openComplaintAction(complaint, "view")} className="inline-flex items-center gap-1.5 rounded-lg bg-green-800 px-3 py-2 text-[10px] font-extrabold text-white transition hover:bg-green-900">
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg>
                                {isAssigned ? "Reassign" : "Assign"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                {!dataLoading && supervisorQueueComplaints.length === 0 && (
                  <div className="px-5 py-10 text-center"><p className="text-sm font-bold text-slate-700">No complaints in your section queue</p><p className="mt-1 text-xs text-slate-500">New complaints routed to {loggedInSectionName || "your assigned section"} will appear here.</p></div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-[10px] text-slate-500 sm:px-6"><span>Showing {supervisorQueueComplaints.length} of {complaints.length} complaints</span><span>{loggedInSectionName || "Assigned section"}</span></div>
            </section>
          )}
          {!isSupervisorDashboard && (
            <>
          {/* COMPLAINTS REGISTER */}
          <section className="mb-8 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
              <SectionHeading
                eyebrow="Complaint register"
                title="All complaints"
                description="Search and review complaints recorded in the system."
              />
            </div>
            <div className="grid gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-[minmax(0,1fr)\_190px] sm:px-6">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Search complaints</span>
                <input
                  value={complaintSearch}
                  onChange={(event) => setComplaintSearch(event.target.value)}
                  placeholder="Search reference, subject or department..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-green-700 focus:ring-2 focus:ring-green-700/10"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Status</span>
                <select
                  value={complaintStatusFilter}
                  onChange={(event) => setComplaintStatusFilter(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-green-700 focus:ring-2 focus:ring-green-700/10"
                >
                  <option value="All">All statuses</option>
                  <option value="New">New</option>
                  <option value="Assigned">Assigned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-xs">
                <thead className="bg-white text-slate-500">
                  <tr>
                    <TableHeading>Reference</TableHeading>
                    <TableHeading>Complaint</TableHeading>
                    <TableHeading>Department</TableHeading>
                    <TableHeading>Priority</TableHeading>
                    <TableHeading>Status</TableHeading>
                    <TableHeading>Date reported</TableHeading>
                    <TableHeading>Actions</TableHeading>
                  </tr>
                </thead>
                <tbody>
                  {groupComplaintsByDate(nonAlertComplaints.filter((complaint) => {
                    const query = complaintSearch.trim().toLowerCase();
                    const matchesSearch = !query || [complaint.reference, complaint.subject, complaint.department]
                      .some((value) => value.toLowerCase().includes(query));
                    const matchesStatus = complaintStatusFilter === "All" || (complaintStatusFilter === "Unassigned" ? !isComplaintAssigned(complaint) : displayComplaintStatus(complaint) === complaintStatusFilter);
                    return matchesSearch && matchesStatus;
                  })).map((group) => (
                    <Fragment key={`register-group-${group.key}`}>
                      <tr key={`register-date-${group.key}`} className="border-t-2 border-slate-200 bg-slate-100/90">
                        <td colSpan={7} className="px-5 py-2.5">
                          <button type="button" onClick={() => setCollapsedDateGroups((current) => ({ ...current, [`register:${group.key}`]: !current[`register:${group.key}`] }))} aria-expanded={!collapsedDateGroups[`register:${group.key}`]} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
                            <span className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-700"><span aria-hidden="true" className="text-sm">{collapsedDateGroups[`register:${group.key}`] ? "▸" : "▾"}</span>{group.label}</span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{group.complaints.length} {group.complaints.length === 1 ? "complaint" : "complaints"}</span>
                          </button>
                        </td>
                      </tr>
                      {!collapsedDateGroups[`register:${group.key}`] && group.complaints.map((complaint) => (
                      <tr key={complaint.id} className="border-t border-slate-100 transition hover:bg-green-50/40">
                        <td className="whitespace-nowrap px-3 py-4 pl-5 font-bold text-green-800">{complaint.reference || "—"}</td>
                        <td className="max-w-[260px] px-3 py-4">
                          <p className="font-bold text-slate-800">{complaint.subject}</p>
                        </td>
                        <td className="max-w-[200px] px-3 py-4 text-slate-600">{complaint.department}</td>
                        <td className="whitespace-nowrap px-3 py-4"><PriorityBadge priority={complaint.priority} /></td>
                        <td className="whitespace-nowrap px-3 py-4"><StatusBadge status={complaint.status} /></td>
                        <td className="whitespace-nowrap px-3 py-4 pr-5 text-slate-500">
                          {complaint.date ? new Date(complaint.date).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 pr-5">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => openComplaintAction(complaint, "view")} className="rounded-lg border border-slate-200 px-3 py-2 font-bold text-green-800 transition hover:bg-green-50">View</button>
                            {!isSupervisorDashboard && <>
                              <button type="button" onClick={() => openComplaintAction(complaint, "edit")} className="rounded-lg border border-amber-200 px-3 py-2 font-bold text-amber-800 transition hover:bg-amber-50">Edit</button>
                              <button type="button" disabled={deletingComplaintId === complaint.id} onClick={() => void handleDeleteComplaint(complaint)} className="rounded-lg border border-red-200 px-3 py-2 font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50">{deletingComplaintId === complaint.id ? "Deleting…" : "Delete"}</button>
                            </>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {!dataLoading && nonAlertComplaints.filter((complaint) => {
                const query = complaintSearch.trim().toLowerCase();
                const matchesSearch = !query || [complaint.reference, complaint.subject, complaint.department].some((value) => value.toLowerCase().includes(query));
                return matchesSearch && (complaintStatusFilter === "All" || complaint.status === complaintStatusFilter);
              }).length === 0 && (
                <div className="px-5 py-10 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-800"><Icon name="complaints" /></div>
                  <p className="mt-3 text-sm font-bold text-slate-700">No complaints found</p>
                  <p className="mt-1 text-xs text-slate-500">Try another search or status, or capture a new complaint.</p>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-3 text-[10px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>Showing {nonAlertComplaints.filter((complaint) => {
                const query = complaintSearch.trim().toLowerCase();
                const matchesSearch = !query || [complaint.reference, complaint.subject, complaint.department].some((value) => value.toLowerCase().includes(query));
                return matchesSearch && (complaintStatusFilter === "All" || complaint.status === complaintStatusFilter);
              }).length} of {nonAlertComplaints.length} individual complaints · {bulkAlertComplaintIds.size} in bulk alerts</span>
            </div>
          </section>
            </>
          )}
          {/* DEPARTMENTS AND ACTIVITY */}
                          <section className="mb-6 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/60 px-5 py-4">
                    <div>
                      <h2 className="text-base font-extrabold text-emerald-800">Assistance requests received</h2>
                      <p className="mt-1 text-sm text-slate-600">Requests sent to {loggedInDepartmentName || "your department"} · {loggedInSectionName || "your section"}</p>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-800">{receivedDepartmentAssistance.length} {receivedDepartmentAssistance.length === 1 ? "request" : "requests"}</span>
                  </div>
                  <div className="space-y-3 p-4">
                    {receivedDepartmentAssistanceLoading ? <p className="px-2 py-3 text-sm text-slate-500">Loading assistance requests…</p>
                    : receivedDepartmentAssistance.length === 0 ? <p className="px-2 py-3 text-sm text-slate-500">No assistance requests have been sent to this department and section.</p>
                    : receivedDepartmentAssistance.map((request, index) => {
                      const note = firstText(request, ["comment"]);
                      const fields = Object.fromEntries(note.split("\\n").slice(1).map((line) => {
                        const splitAt = line.indexOf(": ");
                        return splitAt < 0 ? [line, ""] : [line.slice(0, splitAt), line.slice(splitAt + 2)];
                      }));
                      const requestDate = firstText(request, ["created_at"]);
                      return (
                        <article key={String(request.id || index)} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-extrabold text-slate-900">{fields["Complaint reference"] || "Complaint reference not recorded"} · {fields["Complaint subject"] || "Subject not recorded"}</p>
                              <p className="mt-1 text-xs font-semibold text-emerald-800">Assistance requested from your department</p>
                            </div>
                            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">Awaiting departmental response</span>
                          </div>
                          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {(["Original department", "Original section", "Complainant name", "Complainant contact", "Complainant email", "Service address", "Area / suburb", "Ward", "Complaint status", "Requested department", "Requested section", "Assistance required", "Reason", "Recorded by", "Requester department", "Requester section"] as string[]).map((label) => (
                              <div key={label} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
                                <p className="break-words text-sm text-slate-800">{fields[label] || "Not recorded"}</p>
                              </div>
                            ))}
                            <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 sm:col-span-2 lg:col-span-3">
                              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Complaint description</p>
                              <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{fields["Complaint description"] || "Not recorded"}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-slate-500">Request date: {requestDate ? new Date(requestDate).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded"}</p>
                        </article>
                      );
                    })}
                  </div>
                </section>

<section className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                <SectionHeading
                  eyebrow={isSectionScopedDashboard ? "Section activity" : "Department activity"}
                  title={isSectionScopedDashboard ? "Complaints in your section" : "Complaints by department"}
                  description={isSectionScopedDashboard ? "Complaint volume for your assigned section." : "Complaint volumes across municipal directorates."}
                  action={
                    <Link
                      href="/departments"
                      aria-label="View departments"
                      className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-green-200 hover:text-green-800"
                    >
                      <Icon name="arrow" />
                    </Link>
                  }
                />
              </div>
              {departments.length === 0 ? (
                <EmptyState
                  icon="departments"
                  title="Department data will appear here"
                  description="Departmental volumes will be shown when complaint data is available."
                  compact
                />
              ) : (
                <div className="space-y-5 p-5 sm:p-6">
                  {departments.map((department) => {
                    const max = Math.max(
                      1,
                      ...departments.map((item) => item.complaints)
                    );
                    const percentage = (department.complaints / max) * 100;
                    return (
                      <div key={department.name}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-slate-700">
                            {department.name}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                            {department.complaints}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-green-800 to-green-500 transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                <SectionHeading
                  eyebrow="View Activities"
                  title="Recent activity"
                  description="Recent complaint assignments, councillor alerts and bulk team dispatches."
                  action={
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1.5 text-[10px] font-bold text-green-800">
                      <Icon name="activity" />
                      Activity log
                    </span>
                  }
                />
              </div>
              {activities.length === 0 ? (
                <EmptyState
                  icon="activity"
                  title="No recent activity yet"
                  description="Newly captured complaints, status changes, work updates, assignments, councillor alerts and team dispatches will appear here."
                  compact
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {groupActivitiesByDate(activities).map((group) => (
                    <section key={`activity-date-${group.key}`} aria-label={`Activities for ${group.label}`}>
                      <div className="border-y border-slate-200 bg-slate-50 px-5 py-2.5 sm:px-6">
                        <button
                          type="button"
                          onClick={() => setCollapsedDateGroups((current) => ({ ...current, [`activity:${group.key}`]: !current[`activity:${group.key}`] }))}
                          aria-expanded={!collapsedDateGroups[`activity:${group.key}`]}
                          aria-controls={`activity-items-${group.key}`}
                          className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                        >
                          <span className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-700">
                            <span aria-hidden="true" className="text-sm">{collapsedDateGroups[`activity:${group.key}`] ? "▸" : "▾"}</span>
                            {group.label}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                            {group.activities.length} {group.activities.length === 1 ? "activity" : "activities"}
                          </span>
                        </button>
                      </div>
                      {!collapsedDateGroups[`activity:${group.key}`] && (
                        <div id={`activity-items-${group.key}`}>
                          {group.activities.map((activity, index) => (
                            <button
                              key={`${group.key}-${activity.title}-${activity.time}-${index}`}
                              type="button"
                              onClick={() => {
                                const relatedComplaint = activity.complaintId
                                  ? complaints.find((item) => item.id === activity.complaintId)
                                  : undefined;
                                if (relatedComplaint) openComplaintAction(relatedComplaint, "view");
                              }}
                              disabled={!activity.complaintId || !complaints.some((item) => item.id === activity.complaintId)}
                              title={activity.complaintId ? "View complaint overview" : "No complaint overview available"}
                              className={`flex w-full items-center gap-3 px-5 py-4 text-left sm:px-6 ${activity.complaintId && complaints.some((item) => item.id === activity.complaintId) ? "cursor-pointer transition hover:bg-green-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green-700" : "cursor-default"}`}
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-800">
                                <Icon name="activity" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-bold text-slate-800">{activity.title}</p>
                                <p className="mt-1 text-xs text-slate-500">{activity.description}</p>
                              </div>
                              <span className="shrink-0 text-[10px] text-slate-400">{activity.time}</span>
                              {activity.complaintId && complaints.some((item) => item.id === activity.complaintId) && <span className="shrink-0 text-[10px] font-bold text-green-800">View</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </div>
          </section>
          {selectedComplaint && complaintAction && (
            <div
              className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/65 px-3 py-4 backdrop-blur-sm sm:items-center sm:px-6 sm:py-8"
              role="dialog"
              aria-modal="true"
              aria-labelledby="complaint-action-title"
            >
              <section className={`my-auto flex max-h-[calc(100dvh-2rem)] w-full ${complaintAction === "view" ? "max-w-[210mm] rounded-none border border-slate-300" : "max-w-6xl rounded-[26px] border border-[#dce9df]"} flex-col overflow-hidden bg-white shadow-[0_30px_100px_rgba(16,55,37,0.28)] sm:max-h-[calc(100dvh-4rem)] ${complaintAction === "view" ? "ring-1 ring-slate-200" : ""}`}>
                <header className={`shrink-0 border-b border-slate-200 bg-white ${complaintAction === "view" ? "px-[12mm] py-[8mm]" : "px-5 py-5 sm:px-8 sm:py-6"}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#e2ebe4] bg-white p-2 shadow-sm sm:h-16 sm:w-16">
                        <img
                          src="/Emalahleni%20Logo.png"
                          alt="Emalahleni Local Municipality logo"
                          className="h-full w-full object-contain"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#176b55]">Emalahleni Local Municipality</p>
                        <p className="mt-0.5 text-[10px] font-semibold tracking-[0.12em] text-slate-400">MUNICIPAL SERVICE MANAGEMENT</p>
                        <h2 id="complaint-action-title" className="mt-1 truncate text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                          {complaintAction === "view" ? "Complaint overview" : "Edit complaint"}
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          {selectedComplaint.reference} <span className="mx-1.5 text-slate-300">·</span>
                          {complaintAction === "view" ? "Service request details and service progress" : "Update complaint information"}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={closeComplaintAction} disabled={savingComplaint} aria-label="Close complaint dialog" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-xl text-slate-500 transition hover:border-[#176b55] hover:bg-[#f0f7f1] hover:text-[#176b55] disabled:opacity-50">×</button>
                  </div>
                </header>

                <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${complaintAction === "view" ? "bg-white px-[12mm] py-[7mm]" : "bg-white px-4 py-4 sm:px-6 sm:py-5"}`}>
                  {complaintActionError && (
                    <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      <span className="mt-0.5 font-black">!</span><span>{complaintActionError}</span>
                    </div>
                  )}

                  {complaintAction === "view" && (() => {
                    const matchingAlert = repeatedIssueAlerts.find((item) =>
                      item.tickets.some((ticket) => ticket.id === selectedComplaint.id)
                    );
                    if (!matchingAlert) return null;
                    const relatedDispatches = bulkTeamDispatches.filter((dispatch) => {
                      if (firstText(dispatch, ["alert_key"]) !== matchingAlert.key) return false;
                      if (!isSectionScopedDashboard) return true;
                      const dispatchReferences = Array.isArray(dispatch.complaint_references)
                        ? (dispatch.complaint_references as unknown[]).map(String)
                        : [];
                      return dispatchReferences.some((reference) =>
                        matchingAlert.references.includes(reference)
                      );
                    });
                    return (
                      <section className="mb-5 overflow-hidden rounded-xl border-2 border-red-200 bg-red-50" aria-label="Ward alert and supervisor updates">
                        <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-100 px-4 py-3">
                          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-600" aria-hidden="true" /><h3 className="text-sm font-extrabold text-red-950">Ward {matchingAlert.ward} alert</h3></div>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold text-red-800">{matchingAlert.count} complaints</span>
                        </div>
                        <div className="space-y-3 p-4">
                          <p className="text-xs leading-5 text-red-950">This complaint is part of a repeated-issue bulk alert for this ward. Related complaint references and supervisor dispatch information are shown below.</p>
                          <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Related complaint references</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {matchingAlert.references.map((reference) => (
                                <button
                                  key={reference}
                                  type="button"
                                  onClick={() => openAlertComplaintReference(reference, matchingAlert.tickets)}
                                  title={`View complaint ${reference}`}
                                  className="rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] font-bold text-red-900 underline decoration-red-300 underline-offset-2 transition hover:border-red-400 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                                >
                                  {reference}
                                </button>
                              ))}
                            </div>
                          </div>
                          {relatedDispatches.length === 0 ? <p className="rounded-lg border border-red-200 bg-white p-3 text-xs text-slate-600">The supervisor has not saved a team dispatch for this ward alert yet.</p> : relatedDispatches.map((dispatch) => {
                            const dispatchId = firstText(dispatch, ["id", "created_at"]);
                            const names = Array.isArray(dispatch.team_member_names) ? (dispatch.team_member_names as unknown[]).map(String) : [];
                            const contacts = Array.isArray(dispatch.team_member_contacts) ? (dispatch.team_member_contacts as unknown[]).map((value) => String(value || "Not provided")) : [];
                            const refs = Array.isArray(dispatch.complaint_references) ? (dispatch.complaint_references as unknown[]).map(String) : [];
                            return <div key={dispatchId} className="rounded-lg border border-red-200 bg-white p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs font-extrabold text-slate-900">Team dispatched</p><span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-900">{firstText(dispatch, ["status"], "Dispatched")}</span></div>
                              <p className="mt-1 text-[10px] text-slate-500">{firstText(dispatch, ["created_at"]) && !Number.isNaN(new Date(firstText(dispatch, ["created_at"])).getTime()) ? new Date(firstText(dispatch, ["created_at"])).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "Dispatch time not recorded"}</p>
                              <p className="mt-3 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Dispatched team and contact numbers</p>
                              <div className="mt-1.5 space-y-1">{names.map((name, index) => { const phone = contacts[index] || "Not provided"; return <div key={`${name}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-2"><span className="text-xs font-semibold text-slate-800">{name}</span>{phone !== "Not provided" ? <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="text-xs font-bold text-red-800 underline">{phone}</a> : <span className="text-[10px] text-slate-500">Contact not recorded</span>}</div>; })}{names.length === 0 && <p className="text-xs text-slate-500">No team members recorded.</p>}</div>
                              <p className="mt-3 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Supervisor instructions</p><p className="mt-1 whitespace-pre-wrap text-xs text-slate-800">{firstText(dispatch, ["instructions"], "No instructions recorded.")}</p>
                              <p className="mt-3 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">Dispatch complaint references ({refs.length})</p><div className="mt-1.5 flex flex-wrap gap-1">{refs.map((reference) => <span key={reference} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] text-slate-700">{reference}</span>)}</div>
                              {isSupervisorDashboard && <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                                <button type="button" onClick={() => setReassigningBulkAlertKey((current) => current === matchingAlert.key ? null : matchingAlert.key)} className="rounded-lg border border-green-700 bg-green-50 px-3 py-2 text-[11px] font-extrabold text-green-900 hover:bg-green-100">{reassigningBulkAlertKey === matchingAlert.key ? "Cancel reassignment" : "Reassign team"}</button>
                              </div>}
                            </div>;
                          })}
                           {isSupervisorDashboard && (relatedDispatches.length === 0 || reassigningBulkAlertKey === matchingAlert.key) && <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
                             <div className="flex flex-wrap items-start justify-between gap-2">
                               <div><p className="text-[11px] font-extrabold text-blue-950">{relatedDispatches.length > 0 ? "Reassign ward response team" : "Dispatch response team"}</p><p className="mt-1 text-[10px] leading-4 text-slate-600">{relatedDispatches.length > 0 ? "Select the replacement or additional team members. The previous dispatch remains in the history." : "Select the people who will be dispatched to handle this ward as one bulk response."} The signed-in supervisor is recorded automatically in the dispatch audit.</p></div>
                               {relatedDispatches.length > 0 && <button type="button" onClick={() => setReassigningBulkAlertKey(null)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50">Cancel</button>}
                             </div>
                             <div className="mt-2 grid gap-2 sm:grid-cols-2">
                               <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-800">Response ward</p><p className="mt-1 text-xs font-extrabold text-blue-950">Ward {matchingAlert.ward}</p></div>
                               <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-800">Selected team members</p><p className="mt-1 text-xs font-extrabold text-blue-950">{bulkTeamMemberIds.length} selected</p></div>
                             </div>
                             <div className="mt-3">
                               <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Select multiple team members</span><span className="text-[10px] font-bold text-blue-800">{bulkTeamMemberIds.length} selected</span></div>
                               {(["day", "standby"] as const).map((group) => { const people = eligibleOfficials.filter((person) => (String(person.standby_available ?? "").toLowerCase() === "true") === (group === "standby")); if (people.length === 0) return null; return <div key={group} className="mb-2 overflow-hidden rounded-lg border border-blue-100 bg-white"><p className="border-b border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-blue-900">{group === "standby" ? "Standby team" : "Day shift / general team"}</p><div className="space-y-1 p-2">{people.map((person) => { const personId = firstText(person, ["id"]); const personName = firstText(person, ["full_name", "username", "email"], "Staff member"); const isSelected = bulkTeamMemberIds.includes(personId); return <label key={personId} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${isSelected ? "border-blue-400 bg-blue-50" : "border-transparent hover:border-slate-200 hover:bg-slate-50"}`}><input type="checkbox" checked={isSelected} onChange={(event) => setBulkTeamMemberIds((current) => event.target.checked ? [...current.filter((id) => id !== personId), personId] : current.filter((id) => id !== personId))} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-800 focus:ring-blue-600"/><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-800">{personName}</span><span className="mt-0.5 block text-[10px] text-slate-500">{firstText(person, ["designation"], "Municipal staff")} · {firstText(person, ["contact_number"], "Contact number not recorded")}</span></span>{isSelected && <span className="text-[10px] font-extrabold text-blue-800">Selected</span>}</label>; })}</div></div>; })}
                               {bulkStaffLoading && <p className="text-xs font-semibold text-blue-800">Loading active staff from your section…</p>}
                               {!bulkStaffLoading && bulkStaffLoadError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">Staff directory could not be loaded: {bulkStaffLoadError}</p>}
                               {!bulkStaffLoading && !bulkStaffLoadError && eligibleOfficials.length === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">No active staff members were found in your assigned section.</p>}
                               {bulkTeamMemberIds.length === 0 && eligibleOfficials.length > 0 && <p className="mt-2 text-[11px] text-slate-500">Tick the checkbox beside each person you want to dispatch. You can select more than one.</p>}
                             </div>
                             <label className="mt-2 block"><span className="mb-1 block text-[10px] font-bold text-blue-950">Team instructions</span><textarea value={bulkTeamInstructions} onChange={(event) => setBulkTeamInstructions(event.target.value)} rows={2} placeholder="Shared response instructions for this ward" className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-slate-800"/></label>
                             <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-blue-900">{bulkTeamMemberIds.length} team member(s) selected</span><button type="button" onClick={() => void dispatchBulkWardTeam(matchingAlert)} disabled={savingBulkAlertKey === matchingAlert.key || bulkTeamMemberIds.length === 0} className="rounded-lg bg-blue-900 px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-50">{savingBulkAlertKey === matchingAlert.key ? "Saving team…" : relatedDispatches.length > 0 ? "Save reassigned team" : "Dispatch bulk response"}</button></div>
                             {bulkDispatchNotice && <p role="status" className="mt-2 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-blue-950">{bulkDispatchNotice}</p>}
                           </div>}
                           {isSupervisorDashboard && relatedDispatches.length > 0 && reassigningBulkAlertKey !== matchingAlert.key && <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-xs font-semibold text-green-900">A team has already been dispatched for this ward alert. Review the dispatch details above or choose Reassign team if the response team needs to change.</p>}
                           {bulkDispatchNotice && !reassigningBulkAlertKey && <p role="status" className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">{bulkDispatchNotice}</p>}
                        </div>
                      </section>
                    );
                  })()}

                  {complaintAction === "view" ? (
                    <div className="w-full max-w-none space-y-3">
                      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2"><span className="h-1.5 w-7 rounded-full bg-[#176b55]"/><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#176b55]">Complaint reference</p></div>
                            <p className="mt-1 break-all text-base font-extrabold tracking-tight text-slate-900">{selectedComplaint.reference}</p>
                            <p className="mt-0.5 max-w-3xl text-[11px] font-semibold leading-4 text-slate-700">{selectedComplaint.subject}</p>
                          </div>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700"><span className="h-2 w-2 rounded-full bg-slate-400"/>{selectedComplaint.status}</span>
                        </div>
                        <div className="grid gap-0 border-t border-slate-100 sm:grid-cols-3">
                          <div className="px-4 py-2.5 sm:px-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Date captured</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedComplaint.date ? new Date(selectedComplaint.date).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded"}</p></div>
                          <div className="border-t border-slate-100 px-4 py-2.5 sm:border-l sm:border-t-0 sm:px-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Department</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedComplaint.department || "Not assigned"}</p></div>
                          <div className="border-t border-slate-100 px-5 py-4 sm:border-l sm:border-t-0 sm:px-7"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Priority</p><p className="mt-1 text-xs font-bold text-slate-800">{selectedComplaint.priority}</p></div>
                        </div>
                      </section>

                      {(() => {
                        const raw = selectedComplaint.raw;
                        const progressStatus = firstText(raw, [
                          "progress_status", "work_status", "latest_status", "status"
                        ], selectedComplaint.status || "New");
                        // The complaint row does not necessarily contain the latest
                        // operational update. Read the newest saved work-update row so
                        // the progress panel reflects the Progress update type and Brief note.
                        const latestOperationalUpdate = operationalUpdates[0] || null;
                        const latestOperationalMessage = firstText(latestOperationalUpdate || {}, [
                          "message", "description", "notes", "update_text", "work_description", "comment"
                        ], "");
                        const latestOperationalMessageLines = latestOperationalMessage
                          .split(/\\n|\r?\n/)
                          .map((line) => line.trim())
                          .filter(Boolean);
                        const progressUpdate = firstText(latestOperationalUpdate || {}, [
                          "update_type", "action", "title"
                        ], firstText(raw, [
                          "latest_progress_update", "latest_work_update", "last_update_message",
                          "latest_update", "work_update", "update_message"
                        ], ""));
                        const labelledBriefNote = latestOperationalMessageLines.find((line) => /^Brief note:/i.test(line));
                          const briefNote = labelledBriefNote
                            ? labelledBriefNote.replace(/^Brief note:\s*/i, "").trim()
                            : latestOperationalMessageLines.find((line) =>
                                !/^(Update source:|Updated by:|Complaint status changed to:|Information provided by:|Information received at:|Brief note:)/i.test(line)
                              ) || "";
                        const progressUpdatedAt = firstText(latestOperationalUpdate || {}, [
                          "created_at", "updated_at"
                        ], firstText(raw, [
                          "progress_updated_at", "last_updated_at", "updated_at", "last_work_update_at"
                        ], ""));
                        const progressActorLine = latestOperationalMessage.match(/(?:^|\\n|\\r?\\n)Updated by:\\s*([^\\r\\n]+)/i)?.[1]?.trim() || "";
                        const creatorProfile = (latestOperationalUpdate?._created_by_profile || {}) as DatabaseRow;
                        const progressUpdatedBy = firstText(creatorProfile, ["full_name", "name", "username"])
                          || [firstText(creatorProfile, ["first_name", "firstname"]), firstText(creatorProfile, ["surname", "last_name", "lastname"])].filter(Boolean).join(" ")
                          || firstText(latestOperationalUpdate || {}, ["created_by_name", "updated_by_name", "staff_name"])
                          || progressActorLine.replace(/^.*?\\s[–—-]\\s*/, "").trim()
                          || firstText(raw, ["progress_updated_by_name", "last_updated_by_name", "updated_by_name", "latest_update_by"]);
                        const progressTone = /resolved|completed|closed/i.test(progressStatus)
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : /progress|process|attend|assess/i.test(progressStatus)
                            ? "border-blue-200 bg-blue-50 text-blue-800"
                            : /delay|escalat|unable/i.test(progressStatus)
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-slate-200 bg-slate-50 text-slate-700";
                        const reportedDate = firstText(raw, ["date_reported", "reported_at"], selectedComplaint.date || "");
                        const locationParts = [
                          getComplaintArea(raw),
                          getComplaintWard(raw) ? `Ward ${getComplaintWard(raw)}` : "",
                          firstText(raw, ["address", "physical_address", "street_address", "location_description", "location"])
                        ].filter((part) => part && part !== "Not provided" && part !== "Not recorded");
                        return (
                          <section className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Complainant, location and progress information">
                            <div className="border-b border-slate-100 bg-gradient-to-r from-white to-emerald-50/60">
                              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4">
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20 20a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /></svg>
                                  </span>
                                  <div className="min-w-0">
                                    <h3 className="text-sm font-extrabold text-[#176b55]">Complainant and location information</h3>
                                    <p className="mt-0.5 text-xs leading-5 text-slate-500">Resident contact details, service location and the latest recorded complaint progress.</p>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-800">
                                    <span className="h-2 w-2 rounded-full bg-emerald-700" />
                                    {progressStatus}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setComplaintInformationExpanded((open) => !open)}
                                    aria-expanded={complaintInformationExpanded}
                                    aria-controls="complainant-location-information-panel"
                                    className="inline-flex min-w-[92px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#176b55] focus:ring-offset-2"
                                  >
                                    {complaintInformationExpanded ? "Collapse" : "Expand"}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {complaintInformationExpanded && <div id="complainant-location-information-panel" className="flex w-full min-w-0 flex-col items-stretch gap-3 p-3 sm:p-3">
                              <section className="block w-full min-w-0 overflow-hidden rounded-xl border-2 border-[#176b55]/30 bg-emerald-50/40 shadow-md ring-1 ring-emerald-100">
                                <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-3 py-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800" aria-hidden="true">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20 20a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /></svg>
                                    </span>
                                    <div className="min-w-0">
                                      <h4 className="text-sm font-extrabold text-slate-800">Complainant details</h4>
                                      <p className="text-xs text-slate-500">Information supplied by the person reporting the complaint</p>
                                    </div>
                                  </div>
                                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Reporter</span>
                                </div>

                                <div className="px-3 py-1">
                                  <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                                    <div className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-100 py-2">
                                      <dt className="min-w-0 text-xs leading-5 text-slate-500">Complainant name</dt>
                                      <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-left text-sm font-semibold leading-5 text-slate-800">{firstText(raw, ["full_name", "customer_name", "complainant_name", "name"], "Name not provided")}</dd>
                                    </div>
                                    <div className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-100 py-2">
                                      <dt className="min-w-0 text-xs leading-5 text-slate-500">Contact number</dt>
                                      <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-left text-sm font-semibold leading-5 text-slate-800">{firstText(raw, ["contact_number", "phone_number", "telephone", "mobile"], "Not provided")}</dd>
                                    </div>
                                    <div className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-100 py-2">
                                      <dt className="min-w-0 text-xs leading-5 text-slate-500">Municipal account number</dt>
                                      <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-left text-sm font-semibold leading-5 text-slate-800">{firstText(raw, ["account_number", "account_no", "accountNumber"], "Not provided")}</dd>
                                    </div>
                                    <div className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-100 py-2">
                                      <dt className="min-w-0 text-xs leading-5 text-slate-500">Email address</dt>
                                      <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-left text-sm font-semibold leading-5 text-slate-800">{firstText(raw, ["email", "email_address"], "Not provided")}</dd>
                                    </div>
                                    <div className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-100 py-2">
                                      <dt className="min-w-0 text-xs leading-5 text-slate-500">Preferred contact method</dt>
                                      <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-left text-sm font-semibold leading-5 text-slate-800">{firstText(raw, ["preferred_contact", "preferred_contact_method"], "Not specified")}</dd>
                                    </div>
                                    <div className="flex min-w-0 flex-col items-start gap-0.5 py-2 ">
                                      <dt className="min-w-0 text-xs leading-5 text-slate-500">Received through</dt>
                                      <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-left text-sm font-semibold leading-5 text-slate-800">{firstText(raw, ["received_channel", "channel", "source", "complaint_channel"], "Not recorded")}</dd>
                                    </div>
                                  </dl>
                                </div>
                              </section>

                              <section className="block w-full min-w-0 overflow-hidden rounded-xl border-2 border-[#176b55]/30 bg-emerald-50/40 shadow-md ring-1 ring-emerald-100">
                                <div className="flex items-center gap-2 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-3 py-3">
                                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-800" aria-hidden="true">⌖</span>
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-extrabold text-slate-800">Service location</h4>
                                    <p className="text-xs text-slate-500">Where the complaint requires attention</p>
                                  </div>
                                </div>
                                <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 px-3 py-0.5 sm:grid-cols-2 lg:grid-cols-3">
                                  <div className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-100 py-2">
                                    <dt className="text-xs leading-5 text-slate-500">Ward</dt>
                                    <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-800">{getComplaintWard(raw) || "Not provided"}</dd>
                                  </div>
                                  <div className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-100 py-2">
                                    <dt className="text-xs leading-5 text-slate-500">Area / township</dt>
                                    <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-800">{getComplaintArea(raw) || "Not provided"}</dd>
                                  </div>
                                  <div className="flex min-w-0 flex-col items-start gap-0.5 border-b border-slate-100 py-2 ">
                                    <dt className="text-xs leading-5 text-slate-500">Street address / location</dt>
                                    <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-800">{firstText(raw, ["address", "physical_address", "street_address", "location_description", "location"], "Not provided")}</dd>
                                  </div>
                                  <div className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-100 py-2">
                                    <dt className="text-xs leading-5 text-slate-500">Department</dt>
                                    <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-800">{selectedComplaint.department || "Awaiting assignment"}</dd>
                                  </div>
                                  <div className="flex min-w-0 flex-col items-start gap-1 py-2">
                                    <dt className="text-xs leading-5 text-slate-500">Section</dt>
                                    <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-800">{firstText(raw, ["section_name", "section"], "Awaiting assignment")}</dd>
                                  </div>
                                </dl>
                                {locationParts.length > 0 && (
                                  <p className="mx-3 mb-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2 text-[11px] leading-5 text-slate-600">
                                    <span className="font-bold text-slate-700">Location summary: </span>{locationParts.join(" · ")}
                                  </p>
                                )}
                              </section>

                              {(() => {
                                const attachmentValue =
                                  raw.attachments ??
                                  raw.attachment_urls ??
                                  raw.attachment_url ??
                                  raw.files ??
                                  raw.supporting_documents ??
                                  raw.image_urls ??
                                  raw.images ??
                                  raw.photos ??
                                  raw.photo_urls ??
                                  raw.image_url ??
                                  raw.photo_url ??
                                  raw.complaint_image ??
                                  raw.supporting_image ??
                                  raw.evidence_url;
                                const attachmentItems = Array.isArray(attachmentValue)
                                  ? attachmentValue
                                  : attachmentValue
                                    ? (typeof attachmentValue === "string" && attachmentValue.trim().startsWith("[")
                                      ? (() => {
                                          try {
                                            const parsed: unknown = JSON.parse(attachmentValue);
                                            return Array.isArray(parsed) ? parsed : [attachmentValue];
                                          } catch {
                                            return [attachmentValue];
                                          }
                                        })()
                                      : [attachmentValue])
                                    : [];

                                return (
                                  <section className="block w-full min-w-0 overflow-hidden rounded-xl border-2 border-[#176b55]/30 bg-emerald-50/40 shadow-md ring-1 ring-emerald-100">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-3 py-3">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800" aria-hidden="true">🖼️</span>
                                        <div className="min-w-0">
                                          <h4 className="text-sm font-extrabold text-slate-800">Uploaded images and attachments</h4>
                                          <p className="text-xs text-slate-500">Images and supporting files supplied with this complaint</p>
                                        </div>
                                      </div>
                                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                                        {attachmentItems.length} file(s)
                                      </span>
                                    </div>
                                    {attachmentItems.length === 0 ? (
                                      <p className="px-3 py-4 text-xs leading-5 text-slate-500">No uploaded images or attachments are recorded for this complaint.</p>
                                    ) : (
                                      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {attachmentItems.map((item, index) => {
                                          const file = item && typeof item === "object" && !Array.isArray(item) ? item as DatabaseRow : {};
                                          const url = firstText(file, ["url", "signedUrl", "signed_url", "publicUrl", "public_url", "download_url", "path", "file_url", "storage_url"], typeof item === "string" ? item : "");
                                          const fileName = firstText(file, ["name", "file_name", "filename", "original_name"], url.split("/").pop()?.split("?")[0] || `Attachment ${index + 1}`);
                                          const mimeType = firstText(file, ["mime_type", "mimetype", "content_type", "type"]).toLowerCase();
                                          const isImage = mimeType.startsWith("image/") || /^data:image\//i.test(url) || /\.(jpg|jpeg|png|gif|webp|bmp|svg)(?:[?#]|$)/i.test(url);
                                          return (
                                            <div key={`${url || fileName}-${index}`} className="min-w-0 overflow-hidden rounded-lg border border-emerald-100 bg-white">
                                              {url && isImage ? (
                                                <a href={url} target="_blank" rel="noreferrer" className="block">
                                                  <img src={url} alt={fileName} className="h-48 w-full bg-slate-50 object-contain" />
                                                </a>
                                              ) : url ? (
                                                <a href={url} target="_blank" rel="noreferrer" className="flex min-h-20 items-center gap-2 p-3 text-sm font-semibold text-[#176b55] underline">
                                                  <span aria-hidden="true">📎</span>
                                                  <span className="break-all">{fileName}</span>
                                                </a>
                                              ) : (
                                                <div className="p-3 text-xs text-slate-600">{fileName}</div>
                                              )}
                                              {url && <p className="truncate border-t border-slate-100 px-3 py-2 text-xs text-slate-500" title={fileName}>{fileName}</p>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </section>
                                );
                              })()}

                              <div className="flex w-full min-w-0 flex-col gap-3">
                                {(() => {
                                  const departmentName = firstText(raw, ["department", "department_name", "assigned_department", "routed_department"], "Awaiting assignment");
                                  const sectionName = firstText(raw, ["section", "section_name", "assigned_section", "routed_section"], "Awaiting assignment");
                                  const subjectName = firstText(raw, ["subject", "complaint_subject", "issue", "title"], selectedComplaint.subject || "Not recorded");
                                  const isRouted = departmentName !== "Awaiting assignment" && sectionName !== "Awaiting assignment";

                                  const formatOverviewDate = (value: string) => value && !Number.isNaN(new Date(value).getTime())
                                    ? new Date(value).toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                                    : "Not specified";
                                  const overviewCell = (label: string, value: string, wide = false) => (
                                    <div className={`${wide ? "" : ""} min-w-0 border-b border-slate-100 py-2.5 last:border-b-0`}>
                                      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
                                      <p className="mt-1 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-800">{value || "Not recorded"}</p>
                                    </div>
                                  );
                                  return (
                                    <>





                                    </>
                                  );
                                })()}
                              </div>

                            </div>}
                          </section>
                        );
                      })()}


<section className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Complaint assignment information">
                        <div className="border-b border-slate-100 bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-4">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800" aria-hidden="true">
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                  <circle cx="9" cy="7" r="4" />
                                  <path d="m16 11 2 2 4-4" />
                                </svg>
                              </span>
                              <div className="min-w-0">
                                <h3 className="text-sm font-extrabold text-[#176b55]">Complaint assignment</h3>
                                <p className="mt-0.5 text-xs leading-5 text-slate-500">Assigned staff member and assignment details.</p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-extrabold ${
                                (() => {
                                  const currentAssignment = assignmentByComplaint[selectedComplaint.id] || {};
                                  const hasAssignedStaff = Boolean(
                                    firstText(currentAssignment, ["assigned_staff_id", "new_assignee_id", "assigned_to"]) ||
                                    firstText(currentAssignment, ["assigned_to_name", "assignee_name", "official_name"]) ||
                                    firstText(selectedComplaint.raw, ["assigned_staff_id", "assigned_to", "assigned_user_id", "assignee_id"])
                                  );
                                  return hasAssignedStaff
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                    : "border-slate-200 bg-slate-100 text-slate-600";
                                })()
                              }`}>
                                <span className="h-2 w-2 rounded-full bg-emerald-700" />
                                {(() => {
                                  const currentAssignment = assignmentByComplaint[selectedComplaint.id] || {};
                                  const hasAssignedStaff = Boolean(
                                    firstText(currentAssignment, ["assigned_staff_id", "new_assignee_id", "assigned_to"]) ||
                                    firstText(currentAssignment, ["assigned_to_name", "assignee_name", "official_name"]) ||
                                    firstText(selectedComplaint.raw, ["assigned_staff_id", "assigned_to", "assigned_user_id", "assignee_id"])
                                  );
                                  return hasAssignedStaff ? "Assigned" : "Unassigned";
                                })()}
                              </span>
                              <button
                                type="button"
                                onClick={() => setComplaintAssignmentExpanded((open) => !open)}
                                aria-expanded={complaintAssignmentExpanded}
                                aria-controls="complaint-assignment-panel"
                                className="inline-flex min-w-[92px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#176b55] focus:ring-offset-2"
                              >
                                {complaintAssignmentExpanded ? "Collapse" : "Expand"}
                              </button>
                            </div>
                          </div>
                        </div>
                        {complaintAssignmentExpanded && (() => {
                          const raw = selectedComplaint.raw || {};
                          const progressStatus = firstText(raw, [
                            "progress_status", "work_status", "latest_status", "status"
                          ], selectedComplaint.status || "New");
                          const latestOperationalUpdate = operationalUpdates[0] || null;
                          const latestOperationalMessage = firstText(latestOperationalUpdate || {}, [
                            "message", "description", "notes", "update_text", "work_description", "comment"
                          ], "");
                          const latestOperationalMessageLines = latestOperationalMessage
                            .split(/\\n|\r?\n/)
                            .map((line) => line.trim())
                            .filter(Boolean);
                          const progressUpdate = firstText(latestOperationalUpdate || {}, [
                            "update_type", "action", "title"
                          ], firstText(raw, [
                            "latest_progress_update", "latest_work_update", "last_update_message",
                            "latest_update", "work_update", "update_message"
                          ], ""));
                          const labelledBriefNote = latestOperationalMessageLines.find((line) => /^Brief note:/i.test(line));
                          const briefNote = labelledBriefNote
                            ? labelledBriefNote.replace(/^Brief note:\s*/i, "").trim()
                            : latestOperationalMessageLines.find((line) =>
                                !/^(Update source:|Updated by:|Complaint status changed to:|Information provided by:|Information received at:|Brief note:)/i.test(line)
                              ) || "";
                          const progressUpdatedAt = firstText(latestOperationalUpdate || {}, [
                            "created_at", "updated_at"
                          ], firstText(raw, [
                            "progress_updated_at", "last_updated_at", "updated_at", "last_work_update_at"
                          ], ""));
                          const progressActorLine = latestOperationalMessage.match(/(?:^|\\n|\\r?\\n)Updated by:\\s*([^\\r\\n]+)/i)?.[1]?.trim() || "";
                          // Each saved update records the authenticated user's role and
                          // name. Show the person's name in this field, without the role prefix.
                          const creatorProfile = (latestOperationalUpdate?._created_by_profile || {}) as DatabaseRow;
                          const profileName = firstText(creatorProfile, ["full_name", "name", "username"]);
                          const profileFirstName = firstText(creatorProfile, ["first_name", "firstname"]);
                          const profileSurname = firstText(creatorProfile, ["surname", "last_name", "lastname"]);
                          const progressUpdatedBy = profileName
                            || [profileFirstName, profileSurname].filter(Boolean).join(" ")
                            || firstText(latestOperationalUpdate || {}, ["created_by_name", "updated_by_name", "staff_name"])
                            || progressActorLine.replace(/^.*?\\s[–—-]\\s*/, "").trim()
                            || firstText(raw, ["progress_updated_by_name", "last_updated_by_name", "updated_by_name", "latest_update_by"]);
                          // The save function persists the estimate as expected_completion_at,
                          // calculated from the work-update creation time plus entered hours.
                          const estimateUpdate = operationalUpdates.find((update) => firstText(update, ["expected_completion_at"]));
                          const expectedCompletionAt = firstText(estimateUpdate || {}, ["expected_completion_at"]);
                          const estimateStartAt = firstText(estimateUpdate || {}, ["created_at", "updated_at"]);
                          const estimatedCompletionHours = expectedCompletionAt && estimateStartAt
                            ? Math.max(0, Math.round((new Date(expectedCompletionAt).getTime() - new Date(estimateStartAt).getTime()) / 3600000))
                            : null;
                          const progressTone = /resolved|completed|closed/i.test(progressStatus)
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : /progress|process|attend|assess/i.test(progressStatus)
                              ? "border-blue-200 bg-blue-50 text-blue-800"
                              : /delay|escalat|unable/i.test(progressStatus)
                                ? "border-amber-200 bg-amber-50 text-amber-800"
                                : "border-slate-200 bg-slate-50 text-slate-700";
                          const reportedDate = firstText(raw, ["date_reported", "reported_at"], selectedComplaint.date || "");
                          const locationParts = [
                            getComplaintArea(raw),
                            getComplaintWard(raw) ? `Ward ${getComplaintWard(raw)}` : "",
                            firstText(raw, ["address", "physical_address", "street_address", "location_description", "location"])
                          ].filter((part) => part && part !== "Not provided" && part !== "Not recorded");
                          const assignment = assignmentByComplaint[selectedComplaint.id] || {};
                          const assignedId = firstText(assignment, ["new_assignee_id", "assigned_to"], firstText(selectedComplaint.raw, ["assigned_to", "assigned_user_id", "assignee_id"]));
                          const assignedName = firstText(assignment, ["assigned_to_name", "assignee_name", "official_name"], "");
                          const assignedRole = firstText(assignment, ["assigned_to_role", "role", "position"], "");
                          const assignedDepartment = firstText(assignment, ["assigned_to_department", "department_name", "department"], "");
                          const assignedSection = firstText(assignment, ["assigned_to_section", "section_name", "section"], "");
                          const assignedEmail = firstText(assignment, ["email", "work_email"], "");
                          const assignedContact = firstText(assignment, ["assigned_to_contact", "contact_number", "phone", "mobile"], "");
                          const assignedByProfile = (assignment._assigned_by_profile || {}) as DatabaseRow;
                          const assignedBy = firstText(assignment, ["assigned_by_name"], firstText(assignedByProfile, ["full_name", "username"], ""));
                          const assignedByRole = firstText(assignment, ["assigned_by_role", "created_by_role"], firstText(assignedByProfile, ["access_level", "role", "user_role", "role_name", "designation", "job_title", "position"], ""));
                          const assignedByEmail = firstText(assignment, ["assigned_by_email", "created_by_email"], firstText(assignedByProfile, ["email", "work_email"], ""));
                          const assignedByContact = firstText(assignment, ["assigned_by_contact", "assigned_by_phone", "created_by_phone"], firstText(assignedByProfile, ["phone", "phone_number", "contact_number", "mobile", "cellphone"], ""));
                          const assignedDate = firstText(assignment, ["assigned_at", "created_at"], "");
                          const assignmentNotes = firstText(assignment, ["notes", "assignment_notes", "supervisor_notes"], firstText(selectedComplaint.raw, ["assignment_notes", "supervisor_notes"]));
                          return (
                            <div id="complaint-assignment-panel" className="w-full min-w-0 space-y-3 p-3 sm:p-3">


                              <section className="min-w-0 overflow-hidden rounded-xl border-2 border-[#176b55]/30 bg-emerald-50/40 shadow-md ring-1 ring-emerald-100">
                                <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-2">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5h16v14H4zM8 9h8M8 12h8M8 15h5" /></svg>
                                    </span>
                                    <div className="min-w-0">
                                      <h4 className="text-sm font-extrabold text-slate-800">Department assignment</h4>
                                      <p className="text-xs text-slate-500">Current complaint routing</p>
                                    </div>
                                  </div>
                                  {(() => {
                                    const routedDepartment = firstText(selectedComplaint.raw, ["department", "department_name", "assigned_department", "routed_department"], selectedComplaint.department || "Awaiting assignment");
                                    const routedSection = firstText(selectedComplaint.raw, ["section", "section_name", "assigned_section", "routed_section"], "Awaiting assignment");
                                    const routedSubject = firstText(selectedComplaint.raw, ["subject", "complaint_subject", "issue", "title"], selectedComplaint.subject || "Not recorded");
                                    const routed = routedDepartment !== "Awaiting assignment" && routedSection !== "Awaiting assignment";
                                    return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${routed ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>{routed ? "Assigned" : "Awaiting assignment"}</span>;
                                  })()}
                                </div>
                                <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 px-3 py-0.5 sm:grid-cols-2 lg:grid-cols-3">
                                  {(() => {
                                    const routedDepartment = firstText(selectedComplaint.raw, ["department", "department_name", "assigned_department", "routed_department"], selectedComplaint.department || "Awaiting assignment");
                                    const routedSection = firstText(selectedComplaint.raw, ["section", "section_name", "assigned_section", "routed_section"], "Awaiting assignment");
                                    const routedSubject = firstText(selectedComplaint.raw, ["subject", "complaint_subject", "issue", "title"], selectedComplaint.subject || "Not recorded");
                                    return <>
                                      {[["Department", routedDepartment], ["Section", routedSection], ["Complaint subject", routedSubject]].map(([label, value]) => <div key={label} className="min-w-0 border-b border-slate-100 py-2.5 last:border-b-0"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p><p className="mt-1 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-800">{value}</p></div>)}
                                    </>;
                                  })()}
                                </div>
                              </section>
                              {!assignedId && !assignedName ? (
                                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">This complaint has not yet been assigned to a municipal staff member.</div>
                              ) : (
                              <>
                              <section className="w-full min-w-0 overflow-hidden rounded-xl border-2 border-[#176b55]/30 bg-emerald-50/40 shadow-md ring-1 ring-emerald-100">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-3 py-3">
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-extrabold text-slate-800">Assigned staff member</h4>
                                    <p className="text-xs text-slate-500">Official responsible for attending to this complaint</p>
                                  </div>
                                  <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Assigned</span>
                                </div>
                                <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 px-3 py-1 sm:grid-cols-2 lg:grid-cols-3">
                                  {[
                                    ["Assigned official", assignedName || "Official details not yet recorded"],
                                    ["Designation", assignedRole || "Not recorded"],
                                    ["Official email", assignedEmail || "Not provided"],
                                    ["Official contact", assignedContact || "Not provided"],
                                    ["Department / directorate", assignedDepartment || "Not recorded"],
                                    ["Section", assignedSection || "Not recorded"],
                                    ["Assigned by", assignedBy || "Not recorded"],
                                    ["Assigning person's role", assignedByRole || "Not recorded"],
                                    ["Assigning person's email", assignedByEmail || "Not provided"],
                                    ["Assigning person's contact", assignedByContact || "Not provided"],
                                    ["Assignment date", assignedDate && !Number.isNaN(new Date(assignedDate).getTime()) ? new Date(assignedDate).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "Not recorded"]
                                  ].map(([label, value]) => (
                                    <div key={label} className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-100 py-2">
                                      <dt className="min-w-0 text-xs leading-5 text-slate-500">{label}</dt>
                                      <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-left text-sm font-semibold leading-5 text-slate-800">{value}</dd>
                                    </div>
                                  ))}
                                </dl>
                              </section>
                              {assignmentNotes && (
                                <section className="w-full min-w-0 overflow-hidden rounded-xl border-2 border-[#176b55]/30 bg-emerald-50/40 shadow-md ring-1 ring-emerald-100">
                                  <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-3 py-3">
                                    <h4 className="text-sm font-extrabold text-slate-800">Supervisor instructions</h4>
                                  </div>
                                  <p className="whitespace-pre-wrap break-words px-3 py-2 text-sm leading-5 text-slate-700 [overflow-wrap:anywhere]">{assignmentNotes}</p>
                                </section>
                              )}
                              </>
                              )}
                              <section className="block w-full min-w-0 overflow-hidden rounded-xl border-2 border-[#176b55]/30 bg-emerald-50/40 shadow-md ring-1 ring-emerald-100">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-3 py-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#176b55] text-white shadow-sm" aria-hidden="true">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                                    </span>
                                    <div className="min-w-0">
                                      <h4 className="text-sm font-extrabold text-[#176b55]">Complaint progress</h4>
                                      <p className="text-xs text-slate-600">Current status, latest operational progress and the person who updated it</p>
                                    </div>
                                  </div>
                                  <span className={`rounded-full border px-3 py-1 text-[10px] font-extrabold ${progressTone}`}>{progressStatus}</span>
                                </div>
                                <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 px-3 py-0.5 sm:grid-cols-2 lg:grid-cols-3">
                                  <div className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-100 py-2">
                                    <dt className="text-xs leading-5 text-slate-500">Date reported</dt>
                                    <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-800">{reportedDate ? (Number.isNaN(new Date(reportedDate).getTime()) ? reportedDate : new Date(reportedDate).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })) : "Not recorded"}</dd>
                                  </div>
                                  <div className="flex min-w-0 flex-col items-start gap-1 border-b border-slate-100 py-2">
                                    <dt className="text-xs leading-5 text-slate-500">Last progress update</dt>
                                    <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-800">{progressUpdatedAt ? (Number.isNaN(new Date(progressUpdatedAt).getTime()) ? progressUpdatedAt : new Date(progressUpdatedAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })) : "No update recorded"}</dd>
                                  </div>
                                  <div className="flex min-w-0 flex-col items-start gap-0.5 py-2 ">
                                    <dt className="text-xs leading-5 text-slate-500">Updated by</dt>
                                    <dd className="min-w-0 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-800">{progressUpdatedBy || "Not recorded"}</dd>
                                  </div>
                                </dl>
                                <div className="mx-3 mb-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                                  <div className="min-w-0 rounded-lg border border-emerald-200 bg-white px-3.5 py-3 shadow-sm">
                                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Progress update</p>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-xs font-semibold leading-5 text-slate-700">{progressUpdate || "Not recorded"}</p>
                                  </div>
                                  <div className="min-w-0 rounded-lg border border-emerald-200 bg-white px-3.5 py-3 shadow-sm">
                                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Brief note</p>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{briefNote || "No brief note has been recorded."}</p>
                                  </div>
                                  <div className="min-w-0 rounded-lg border border-emerald-200 bg-white px-3.5 py-3 shadow-sm">
                                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Estimated completion (hours)</p>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-xs font-semibold leading-5 text-slate-700">
                                      {estimatedCompletionHours !== null ? `${estimatedCompletionHours} ${estimatedCompletionHours === 1 ? "hour" : "hours"}` : "Not recorded"}
                                    </p>
                                  </div>
                                </div>
                              </section>

                              <section className="block w-full min-w-0 overflow-hidden rounded-xl border-2 border-[#176b55]/30 bg-emerald-50/40 shadow-md ring-1 ring-emerald-100">
                                {(() => {
                                  const latestResourceUpdate = operationalUpdates.find((update) =>
                                    ["resource_status", "resources_needed", "resource_shortage_reason", "expected_resources_at"].some((key) => firstText(update, [key]))
                                  );
                                  const resourceStatus = latestResourceUpdate ? firstText(latestResourceUpdate, ["resource_status"], "Not assessed") : "Not recorded";
                                  const resourceNeeded = latestResourceUpdate ? firstText(latestResourceUpdate, ["resources_needed"], "Not recorded") : "Not recorded";
                                  const resourceReason = latestResourceUpdate ? firstText(latestResourceUpdate, ["resource_shortage_reason"], "None recorded") : "Not recorded";
                                  const expectedAt = latestResourceUpdate ? firstText(latestResourceUpdate, ["expected_resources_at"]) : "";
                                  const recordedAt = latestResourceUpdate ? firstText(latestResourceUpdate, ["created_at", "updated_at"]) : "";
                                  const formatResourceDate = (value: string) => value && !Number.isNaN(new Date(value).getTime())
                                    ? new Date(value).toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                                    : "Not specified";
                                  return (
                                    <>
                                      <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 4.75h14v14.5H5zM8 8h8M8 11.5h8M8 15h5" /></svg>
                                          </span>
                                          <div className="min-w-0">
                                            <h4 className="text-sm font-extrabold text-[#176b55]">Resources and constraints</h4>
                                            <p className="text-xs text-slate-500">Latest resource position</p>
                                          </div>
                                        </div>
                                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${resourceStatus === "Available" ? "bg-green-50 text-green-800" : resourceStatus === "Unavailable" || resourceStatus === "Awaiting resources" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                                          {resourceStatus}
                                        </span>
                                      </div>
                                      {operationalUpdatesLoading ? (
                                        <p className="px-4 py-5 text-sm text-slate-500">Loading resource details…</p>
                                      ) : !latestResourceUpdate ? (
                                        <p className="px-4 py-5 text-sm leading-6 text-slate-500">No resource details have been recorded for this complaint yet.</p>
                                      ) : (
                                        <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 px-3 py-0.5 sm:grid-cols-2 lg:grid-cols-3">
                                          {[
                                            ["Resources required", resourceNeeded],
                                            ["Expected availability", expectedAt ? formatResourceDate(expectedAt) : "Not specified"],
                                            ["Constraint / shortage reason", resourceReason],
                                            ["Last updated", formatResourceDate(recordedAt)],
                                            ["Updated by", firstText(latestResourceUpdate, ["updated_by_name", "created_by_name", "staff_name", "user_name", "recorded_by"], "Not recorded")],
                                          ].map(([label, value]) => (
                                            <div key={label} className="min-w-0 border-b border-slate-100 py-2.5 last:border-b-0">
                                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
                                              <p className="mt-1 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-800">{value}</p>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </section>
                              <section className="block w-full min-w-0 overflow-hidden rounded-xl border-2 border-[#176b55]/30 bg-emerald-50/40 shadow-md ring-1 ring-emerald-100">
                                <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100" aria-hidden="true">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M3 12h18M5.5 5.5l13 13m0-13-13 13" /></svg>
                                    </span>
                                    <div className="min-w-0">
                                      <h4 className="text-sm font-extrabold text-[#176b55]">Assistance from another department</h4>
                                      <p className="text-xs text-slate-500">Latest interdepartmental support request</p>
                                    </div>
                                  </div>
                                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${departmentAssistanceHistory.length ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                                    {departmentAssistanceHistory.length ? `${departmentAssistanceHistory.length} recorded` : "Not recorded"}
                                  </span>
                                </div>
                                {departmentAssistanceLoading ? (
                                  <p className="px-4 py-5 text-sm text-slate-500">Loading assistance details…</p>
                                ) : departmentAssistanceHistory.length === 0 ? (
                                  <p className="px-4 py-5 text-sm leading-6 text-slate-500">No assistance from another department has been recorded for this complaint yet.</p>
                                ) : (() => {
                                  const latest = departmentAssistanceHistory[0];
                                  const note = firstText(latest, ["comment"]);
                                  const fields = Object.fromEntries(note.split("\\n").slice(1).map((line) => {
                                    const separator = line.indexOf(": ");
                                    return separator < 0 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 2)];
                                  }));
                                  const recordedAt = firstText(latest, ["created_at"]);
                                  const formattedAt = recordedAt && !Number.isNaN(new Date(recordedAt).getTime())
                                    ? new Date(recordedAt).toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                                    : "Not recorded";
                                  return (
                                    <div className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 px-3 py-0.5 sm:grid-cols-2 lg:grid-cols-3">
                                      {[
                                        ["Department", fields["Requested department"] || "Not recorded"],
                                        ["Section", fields["Requested section"] || "Not recorded"],
                                        ["Assistance required", fields["Assistance required"] || "Not recorded"],
                                        ["Reason", fields["Reason"] || "Not provided"],
                                        ["Requested by", fields["Recorded by"] || "Not recorded"],
                                        ["Request date", formattedAt],
                                      ].map(([label, value]) => (
                                        <div key={label} className="min-w-0 border-b border-slate-100 py-2.5 last:border-b-0">
                                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</p>
                                          <p className="mt-1 break-words [overflow-wrap:anywhere] text-sm font-semibold leading-5 text-slate-800">{value}</p>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </section>

                            </div>
                          );
                        })()}
                      </section>

                      {(isCallCentreAgentAccount || isAdministratorAccount || isSupervisorDashboard) && (
                          <section className="mb-5 w-full max-w-none overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <button
                              type="button"
                              onClick={() => setDepartmentRoutingExpanded((expanded) => !expanded)}
                              aria-expanded={departmentRoutingExpanded}
                              aria-controls="department-routing-panel"
                              className="flex w-full items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 text-left transition hover:bg-slate-100/70"
                            >
                              <span className="flex min-w-0 items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5v11.5H3.75zM8 10h8m-8 4h5M7 3.75v3m10-3v3" /></svg>
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-sm font-extrabold text-[#176b55]">{isSupervisorDashboard ? "Not part of your department? Redirect to the correct department" : "Assign department, section and subject"}</span>
                                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">{isSupervisorDashboard ? "If this complaint belongs to another department, select the correct department, section and complaint subject to redirect it." : "Select the department, section and subject responsible for this complaint."}</span>
                                </span>
                              </span>
                              <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">
                                {departmentRoutingExpanded ? "Collapse" : "Expand"}

                              </span>
                            </button>
                            {departmentRoutingExpanded && (
                              <div id="department-routing-panel" className="border-t border-slate-100 p-5">
                            {redirectNotice && <p role="status" className="mb-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-900">{redirectNotice}</p>}
                            {redirectError && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{redirectError}</p>}
                            {redirectOptionsLoading ? (
                              <p className="text-xs font-semibold text-emerald-800">Checking active department routing…</p>
                            ) : (
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <label className="block min-w-0">
                                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Department</span>
                                  <select
                                    value={redirectDepartmentName}
                                    onChange={(event) => {
                                      setRedirectDepartmentName(event.target.value);
                                      setRedirectSectionName("");
                                      setRedirectSubject("");
                                      setRedirectOtherSubject("");
                                      setRedirectError("");
                                      setRedirectNotice("");
                                    }}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                                  >
                                    <option value="">Select department</option>
                                    {REDIRECT_DEPARTMENTS.map((department) => (
                                      <option key={department} value={department}>{department}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block min-w-0">
                                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Section</span>
                                  <select
                                    value={redirectSectionName}
                                    onChange={(event) => {
                                      setRedirectSectionName(event.target.value);
                                      setRedirectSubject("");
                                      setRedirectOtherSubject("");
                                      setRedirectError("");
                                      setRedirectNotice("");
                                    }}
                                    disabled={!redirectDepartmentName}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none disabled:cursor-not-allowed disabled:bg-slate-100 focus:border-green-600 focus:ring-2 focus:ring-green-100"
                                  >
                                    <option value="">{redirectDepartmentName ? "Select section" : "Select department first"}</option>
                                    {(REDIRECT_SECTIONS_BY_DEPARTMENT[redirectDepartmentName] || []).map((section) => (
                                      <option key={section} value={section}>{section}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block min-w-0">
                                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Complaint subject</span>
                                  <select
                                    value={redirectSubject}
                                    onChange={(event) => {
                                      setRedirectSubject(event.target.value);
                                      setRedirectOtherSubject("");
                                      setRedirectError("");
                                      setRedirectNotice("");
                                    }}
                                    disabled={!redirectDepartmentName || !redirectSectionName}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none disabled:cursor-not-allowed disabled:bg-slate-100 focus:border-green-600 focus:ring-2 focus:ring-green-100"
                                  >
                                    <option value="">{!redirectDepartmentName ? "Select department first" : !redirectSectionName ? "Select section first" : "Select complaint issue"}</option>
                                    {REDIRECT_COMPLAINT_SUBJECTS
                                      .filter((item) => item.department === redirectDepartmentName && item.section === redirectSectionName)
                                      .map((item, index) => (
                                        <option key={`${item.department}-${item.section}-${item.subject}-${index}`} value={item.subject}>{item.subject}</option>
                                      ))}
                                    <option value="Other">Other – enter complaint subject</option>
                                  </select>
                                </label>
                                {redirectSubject === "Other" && (
                                  <label className="block sm:col-span-3">
                                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Specify complaint subject</span>
                                    <input
                                      value={redirectOtherSubject}
                                      onChange={(event) => setRedirectOtherSubject(event.target.value)}
                                      placeholder="Enter the complaint subject"
                                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                                    />
                                  </label>
                                )}
                              </div>
                            )}
                            {isCallCentreAgentAccount && (
                              <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                                <div className="mb-3">
                                  <h4 className="text-sm font-extrabold text-[#176b55]">Supervisor and Clerk availability</h4>
                                  <p className="mt-1 text-xs leading-5 text-slate-600">Availability information for the selected complaint section. This is for reference only; the Call Centre Agent does not assign staff here.</p>
                                </div>
                                {routingLoading ? (
                                  <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">Loading staff availability…</p>
                                ) : routingError ? (
                                  <p className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">{routingError}</p>
                                ) : (
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    {([
                                      { key: "normal", title: "Normal Shift" },
                                      { key: "standby", title: "Standby" },
                                    ] as const).map((group) => {
                                      const people = eligibleRoutingUsers.filter((person) => {
                                        const duty = firstText(person, ["duty_type", "shift_type"]).trim().toLowerCase().replace(/[ _-]+/g, " ");
                                        const standbyFlag = String(person.standby_available ?? "").toLowerCase() === "true";
                                        const isStandby = standbyFlag || duty.includes("standby");
                                        return group.key === "standby" ? isStandby : !isStandby;
                                      });
                                      return (
                                        <div key={group.key} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-extrabold text-slate-700">{group.title} <span className="ml-1 font-semibold text-slate-500">({people.length})</span></div>
                                          {people.length ? (
                                            <ul className="divide-y divide-slate-100">
                                              {people.map((person) => (
                                                <li key={firstText(person, ["id"])} className="px-3 py-2">
                                                  <p className="text-xs font-bold text-slate-800">{firstText(person, ["full_name", "username"], "Staff member")}</p>
                                                  <p className="mt-0.5 text-[11px] text-slate-500">{firstText(person, ["designation", "access_level"], "Municipal staff")}</p>
                                                </li>
                                              ))}
                                            </ul>
                                          ) : <p className="px-3 py-3 text-xs text-slate-500">No active Supervisors or Clerks listed.</p>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-100 pt-3">
                              <p className="text-[11px] text-emerald-900">{isSupervisorDashboard ? "If this complaint is not part of your department, redirect it to the correct department and section. These options match Complaint Capture." : "Select the responsible department, section and complaint subject. These options match Complaint Capture."}</p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleRedirectComplaint("Assigned")}
                                  disabled={redirectOptionsLoading || redirectSaving || !redirectDepartmentName || !redirectSectionName || !redirectSubject || (redirectSubject === "Other" && !redirectOtherSubject.trim())}
                                  className="rounded-xl bg-emerald-800 px-5 py-2.5 text-xs font-extrabold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {redirectSaving ? "Saving…" : isSupervisorDashboard ? "Redirect department" : "Assign"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleRedirectComplaint("Reassigned")}
                                  disabled={redirectOptionsLoading || redirectSaving || !redirectDepartmentName || !redirectSectionName || !redirectSubject || (redirectSubject === "Other" && !redirectOtherSubject.trim())}
                                  className="rounded-xl border border-emerald-800 bg-white px-5 py-2.5 text-xs font-extrabold text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {redirectSaving ? "Saving…" : isSupervisorDashboard ? "Redirect again" : "Reassign"}
                                </button>
                              </div>
                            </div>
                              </div>
                            )}
                          </section>
                      )}

                      

                      {isSupervisorAccount && (
                        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                              <Icon name="users" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-extrabold text-[#176b55]">Assign staff</h3>
                              <p className="mt-0.5 text-xs text-slate-500">Choose an active municipal team member from {loggedInSectionName || "your assigned section"}.</p>
                            </div>
                            <button type="button" onClick={() => setStaffAssignmentExpanded((open) => !open)} aria-expanded={staffAssignmentExpanded} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">{staffAssignmentExpanded ? "Collapse" : "Expand"}</button>
                          </div>
                          {staffAssignmentExpanded && <div className="p-5">
                            {assignmentNotice && <p role="status" className="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">{assignmentNotice}</p>}
                            {complaintActionError && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{complaintActionError}</p>}
                            {staffAssignmentLoading ? <p className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">Loading active staff for {loggedInSectionName || "your section"}…</p> : null}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Municipal staff member</span>
                                <select value={selectedOfficialId} onChange={(event) => setSelectedOfficialId(event.target.value)} disabled={staffAssignmentLoading || eligibleOfficials.length === 0} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 disabled:cursor-not-allowed disabled:bg-slate-100">
                                  <option value="">{staffAssignmentLoading ? "Loading staff…" : "Select a staff member in this section"}</option>
                                  <optgroup label="Normal shift / day shift">
                                    {eligibleOfficials.filter((person) => {
                                      const duty = firstText(person, ["duty_type", "shift_type"]).toLowerCase().replace(/[ -]/g, "_");
                                      return duty !== "standby" && String(person.standby_available ?? "").toLowerCase() !== "true";
                                    }).map((person) => <option key={firstText(person, ["id"])} value={firstText(person, ["id"])}>{firstText(person, ["full_name"], "Staff member")} — {firstText(person, ["designation"], "Municipal staff")}</option>)}
                                  </optgroup>
                                  <optgroup label="Standby team">
                                    {eligibleOfficials.filter((person) => {
                                      const duty = firstText(person, ["duty_type", "shift_type"]).toLowerCase().replace(/[ -]/g, "_");
                                      return duty === "standby" || String(person.standby_available ?? "").toLowerCase() === "true";
                                    }).map((person) => <option key={firstText(person, ["id"])} value={firstText(person, ["id"])}>{firstText(person, ["full_name"], "Staff member")} — {firstText(person, ["designation"], "Municipal staff")}</option>)}
                                  </optgroup>
                                </select>
                                {!staffAssignmentLoading && eligibleOfficials.length === 0 && <span className="mt-1 block text-xs text-amber-800">No active staff members were found in {loggedInSectionName || "your section"}. Check the Staff Directory and confirm that staff are active and assigned to this section.</span>}
                                {selectedOfficialId && (() => {
                                  const selectedStaff = eligibleOfficials.find((person) => firstText(person, ["id"]) === selectedOfficialId);
                                  if (!selectedStaff) return null;
                                  const duty = firstText(selectedStaff, ["duty_type", "shift_type"], String(selectedStaff.standby_available ?? "").toLowerCase() === "true" ? "Standby" : "Normal shift");
                                  const isStandby = duty.toLowerCase().includes("standby") || String(selectedStaff.standby_available ?? "").toLowerCase() === "true";
                                  return <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${isStandby ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800"}`}>{isStandby ? "Standby team" : "Normal shift / day shift"} · {duty.replace(/_/g, " ")}</span>;
                                })()}
                              </label>
                              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Instructions (optional)</span><textarea value={assignmentNotesInput} onChange={(event) => setAssignmentNotesInput(event.target.value)} rows={2} placeholder="Add instructions or priority notes" className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100" /></label>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                              <p className="text-[11px] text-slate-500">{selectedOfficialId ? "A staff member is selected. You can now save the assignment." : "Select a staff member to enable assignment or reassignment."}</p>
                              <button type="button" onClick={() => void handleAssignOfficial()} disabled={savingAssignment || staffAssignmentLoading || !selectedOfficialId || eligibleOfficials.length === 0} className="rounded-xl bg-green-800 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50">{savingAssignment ? "Saving assignment…" : (assignmentByComplaint[selectedComplaint.id] ? "Reassign complaint" : "Assign staff")}</button>
                            </div>
                          </div>}
                        </section>
                      )}


                      {(() => {
                        const attachmentValue = selectedComplaint.raw.attachments ?? selectedComplaint.raw.attachment_urls ?? selectedComplaint.raw.files ?? selectedComplaint.raw.supporting_documents;
                        const attachmentItems = Array.isArray(attachmentValue) ? attachmentValue : attachmentValue ? [attachmentValue] : [];
                        if (attachmentItems.length === 0) return null;
                        return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-4">
                          <h3 className="text-sm font-extrabold text-slate-800">Supporting attachments</h3>
                          <div className="mt-3 flex flex-wrap gap-2">{attachmentItems.map((item, index) => {
                            const file = item && typeof item === "object" ? item as DatabaseRow : {};
                            const url = firstText(file, ["url", "signedUrl", "publicUrl", "path"], typeof item === "string" ? item : "");
                            const name = firstText(file, ["name", "file_name", "filename", "original_name"], url.split("/").pop() || `Attachment ${index + 1}`);
                            return url ? <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-bold text-green-900 underline">{name}</a> : <span key={index} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{name}</span>;
                          })}</div>
                        </section>;
                      })()}

                      

                      
                      {canUseOperationalUpdates && (
                      <section className="w-full max-w-none overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8m-8 5h8m-8 5h5M5 3.75h14A1.25 1.25 0 0 1 20.25 5v14A1.25 1.25 0 0 1 19 20.25H5A1.25 1.25 0 0 1 3.75 19V5A1.25 1.25 0 0 1 5 3.75Z" /></svg>
                            </div>
                            <div>
                              <h3 className="text-sm font-extrabold text-[#176b55]">Operational update</h3>
                              <p className="mt-0.5 text-xs text-slate-500">Record the latest complaint progress.</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2"><button type="button" onClick={() => setExpandedComplaintPanels((current) => ({ ...current, operational: !current.operational }))} aria-expanded={Boolean(expandedComplaintPanels.operational)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">{expandedComplaintPanels.operational ? "Collapse" : "Expand"}</button></div>
                        </div>
                        {expandedComplaintPanels.operational && <div className="p-5">
                          {operationalUpdateNotice && <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm font-semibold text-green-900">{operationalUpdateNotice}</div>}
                          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className="block w-full min-w-0">
                              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Information provided by</span>
                              <input value={officialFeedbackName} onChange={(e) => setOfficialFeedbackName(e.target.value)} placeholder="Enter the official or person’s name" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-600 focus:bg-white focus:ring-2 focus:ring-green-100" />
                            </label>
                            <label className="block w-full min-w-0">
                              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Role / position / designation</span>
                              <input value={officialFeedbackDesignation} onChange={(e) => setOfficialFeedbackDesignation(e.target.value)} placeholder="e.g. Supervisor, Manager, Water Services Officer" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-600 focus:bg-white focus:ring-2 focus:ring-green-100" />
                            </label>
                            <label className="block w-full min-w-0">
                              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Progress update</span>
                              <select value={operationalUpdateType} onChange={(e) => setOperationalUpdateType(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-green-600 focus:bg-white focus:ring-2 focus:ring-green-100">
                                { ["Received", "Will Attend", "Assessing Situation", "Work In Progress", "Delayed", "Resources Required", "Awaiting Resources", "Work Completed", "Unable to Resolve"].map((v) => <option key={v}>{v}</option>) }
                              </select>
                            </label>
                            <label className="block w-full min-w-0">
                              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Complaint status</span>
                              <select value={operationalUpdateStatus} onChange={(e) => setOperationalUpdateStatus(e.target.value as ComplaintStatus)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-green-600 focus:bg-white focus:ring-2 focus:ring-green-100">
                                { ["Assigned", "In Progress", "Completed", "Resolved"].map((v) => <option key={v}>{v}</option>) }
                              </select>
                            </label>
                            <label className="block w-full min-w-0 sm:col-span-2">
                              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Brief note <span className="font-normal text-slate-400">(optional)</span></span>
                              <input value={operationalMessage} onChange={(e) => setOperationalMessage(e.target.value)} placeholder="Add a short progress note" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-600 focus:bg-white focus:ring-2 focus:ring-green-100" />
                            </label>
                            <label className="block w-full min-w-0 sm:col-span-2">
                              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Estimated completion (hours) <span className="font-normal text-slate-400">(optional)</span></span>
                              <input type="number" min="1" step="1" value={expectedCompletionAt} onChange={(e) => setExpectedCompletionAt(e.target.value)} placeholder="e.g. 4" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-green-600 focus:bg-white focus:ring-2 focus:ring-green-100" />
                              <span className="mt-1 block text-[11px] text-slate-500">Enter how many hours the team expects the work to take from now.</span>
                            </label>
                          </div>

                          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                            <p className="text-xs text-slate-500">The update date and time are added automatically when saved.</p>
                            <button type="button" onClick={() => void handleSaveOperationalUpdate()} disabled={savingOperationalUpdate} className="inline-flex items-center justify-center rounded-xl bg-green-800 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-900 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{savingOperationalUpdate ? "Saving…" : "Save update"}</button>
                          </div>
                        </div>}
                      </section>
                      )}

                      {canUseOperationalUpdates && (
                      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                          <Icon name="list" />
                        </div>
                        <div className="min-w-0 flex-1"><h3 className="text-sm font-extrabold text-[#176b55]">Resources and constraints</h3><p className="mt-0.5 text-xs text-slate-500">Record what the team needs to complete the work.</p></div>
<button type="button" onClick={() => setExpandedComplaintPanels((current) => ({ ...current, resources: !current.resources }))} aria-expanded={Boolean(expandedComplaintPanels.resources)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">{expandedComplaintPanels.resources ? "Collapse" : "Expand"}</button>
</div>
{expandedComplaintPanels.resources && (
<>
{operationalUpdateNotice && <p role="status" className="mx-5 mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm font-semibold text-green-900">{operationalUpdateNotice}</p>}
{operationalUpdatesLoading ? (
                          <p className="text-sm text-slate-500">Loading resource information…</p>
                        ) : (() => {
                          const latestResourceUpdate = operationalUpdates.find((update) =>
                            ["resource_status", "resources_needed", "resource_shortage_reason", "expected_resources_at"].some((key) => firstText(update, [key]))
                          );
                          if (!latestResourceUpdate) return <p className="text-sm text-slate-500">No resource information has been recorded for this complaint yet. Use the operational update below to record resource availability, requirements or constraints.</p>;
                          const expectedAt = firstText(latestResourceUpdate, ["expected_resources_at"]);
                          const formattedExpectedAt = expectedAt && !Number.isNaN(new Date(expectedAt).getTime())
                            ? new Date(expectedAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
                            : expectedAt;
                          return (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <DetailField label="Resource availability" value={firstText(latestResourceUpdate, ["resource_status"], "Not recorded")} />
                              <DetailField label="Resources needed" value={firstText(latestResourceUpdate, ["resources_needed"], "Not recorded")} />
                              <DetailField label="Reason for resource delay / shortage" value={firstText(latestResourceUpdate, ["resource_shortage_reason"], "Not recorded")} />
                              <DetailField label="Expected resource availability" value={formattedExpectedAt || "Not recorded"} />
                            </div>
                          );
                        })()}
<div className="mt-4 border-t border-slate-100 pt-4">
<div className="grid gap-3 sm:grid-cols-2">
<label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Resource availability</span><select value={resourceAvailability} onChange={(e) => setResourceAvailability(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800">{["Not assessed", "Available", "Partially available", "Unavailable", "Awaiting resources"].map((v) => <option key={v}>{v}</option>)}</select></label>
<label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Resources needed</span><input value={resourcesNeeded} onChange={(e) => setResourcesNeeded(e.target.value)} placeholder="e.g. Tipper truck, tools, materials" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800" /></label>
<label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Reason resources are delayed</span><input value={resourceShortageReason} onChange={(e) => setResourceShortageReason(e.target.value)} placeholder="Brief reason" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800" /></label>
<label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">Expected resource availability</span><input type="datetime-local" value={expectedResourcesAt} onChange={(e) => setExpectedResourcesAt(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800" /></label>
</div>
<div className="mt-4 flex justify-end"><button type="button" onClick={() => void handleSaveOperationalUpdate("resources")} disabled={savingOperationalUpdate} className="rounded-xl bg-green-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-900 disabled:opacity-60">{savingOperationalUpdate ? "Saving…" : "Save resource changes"}</button></div>
</div>
</>
                        )}
                      </section>
                      )}

                      {canUseOperationalUpdates && (
                        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                              <Icon name="building" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-extrabold text-[#176b55]">Assistance from another department</h3>
                              <p className="mt-0.5 text-xs text-slate-500">Record support required from another municipal department.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setExpandedComplaintPanels((current) => ({ ...current, assistance: !current.assistance }))}
                              aria-expanded={Boolean(expandedComplaintPanels.assistance)}
                              aria-controls="department-assistance-panel"
                              className="inline-flex min-w-[92px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#176b55] focus:ring-offset-2"
                            >
                              {expandedComplaintPanels.assistance ? "Collapse" : "Expand"}
                            </button>
                          </div>
                          {expandedComplaintPanels.assistance && (
                            <div id="department-assistance-panel" className="space-y-4 p-5">
                              <div className="space-y-3">
                                <h4 className="text-sm font-bold text-slate-800">Recorded assistance requests</h4>
                                {departmentAssistanceLoading ? (
                                  <p className="text-sm text-slate-500">Loading recorded requests…</p>
                                ) : departmentAssistanceHistory.length === 0 ? (
                                  <p className="text-sm text-slate-500">No assistance requests have been recorded for this complaint.</p>
                                ) : departmentAssistanceHistory.map((request, index) => {
                                  const note = firstText(request, ["comment"]);
                                  const fields = Object.fromEntries(note.split("\\n").slice(1).map((line) => {
                                    const separator = line.indexOf(": ");
                                    return separator < 0 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 2)];
                                  }));
                                  const timestamp = firstText(request, ["created_at"]);
                                  return (
                                    <div key={`${timestamp}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                      <div className="mb-3 text-xs font-semibold text-slate-500">
                                        {timestamp ? new Date(timestamp).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" }) : "Date not recorded"}
                                      </div>
                                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <DetailField label="Department" value={fields["Requested department"] || "Not recorded"} />
                                        <DetailField label="Section" value={fields["Requested section"] || "Not recorded"} />
                                        <DetailField label="Recorded by" value={fields["Recorded by"] || "Not recorded"} />
                                        <DetailField label="Assistance required" value={fields["Assistance required"] || "Not recorded"} />
                                        <DetailField label="Reason" value={fields["Reason"] || "Not provided"} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="border-t border-slate-100 pt-4">
                                <h4 className="mb-3 text-sm font-bold text-slate-800">Record a new assistance request</h4>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block">
                                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Department required</span>
                                  <select
                                    value={assistanceDepartment}
                                    onChange={(event) => { setAssistanceDepartment(event.target.value); setAssistanceSection(""); setDepartmentAssistanceNotice(""); }}
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
                                  >
                                    <option value="">Select a department</option>
                                    {REDIRECT_DEPARTMENTS.filter((name) => name !== selectedComplaint.department).map((name) => <option key={name} value={name}>{name}</option>)}
                                  </select>
                                </label>
                                <label className="block">
                                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Section required</span>
                                  <select
                                    value={assistanceSection}
                                    onChange={(event) => setAssistanceSection(event.target.value)}
                                    disabled={!assistanceDepartment}
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-50"
                                  >
                                    <option value="">Select a section</option>
                                    {(REDIRECT_SECTIONS_BY_DEPARTMENT[assistanceDepartment] || []).map((name) => <option key={name} value={name}>{name}</option>)}
                                  </select>
                                </label>
                                <label className="block sm:col-span-2">
                                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Assistance required</span>
                                  <textarea
                                    value={assistanceDetails}
                                    onChange={(event) => setAssistanceDetails(event.target.value)}
                                    rows={3}
                                    placeholder="Describe the support required from the other department."
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                                  />
                                </label>
                                <label className="block sm:col-span-2">
                                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Reason for requesting assistance</span>
                                  <textarea
                                    value={assistanceReason}
                                    onChange={(event) => setAssistanceReason(event.target.value)}
                                    rows={2}
                                    placeholder="Explain why assistance from another department is needed."
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                                  />
                                </label>
                              </div>
                              </div>
                              {departmentAssistanceNotice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{departmentAssistanceNotice}</p>}
                              <div className="flex justify-end border-t border-slate-100 pt-4">
                                <button
                                  type="button"
                                  disabled={savingDepartmentAssistance || !assistanceDepartment || !assistanceSection || !assistanceDetails.trim()}
                                  onClick={async () => {
                                    if (!selectedComplaint?.id || savingDepartmentAssistance) return;
                                    setSavingDepartmentAssistance(true);
                                    setDepartmentAssistanceNotice("");
                                    try {
                                      const supabase = createClient();
                                      const { data: authResult, error: authError } = await supabase.auth.getUser();
                                      if (authError || !authResult.user) throw new Error(authError?.message || "Your sign-in session has expired. Sign in again.");
                                      const complaintRaw = selectedComplaint.raw || {};
                                      const requestNote = [
                                        "ASSISTANCE FROM ANOTHER DEPARTMENT",
                                        "Request type: Assistance requested from your department",
                                        `Complaint reference: ${selectedComplaint.reference}`,
                                        `Complaint subject: ${selectedComplaint.subject}`,
                                        `Original department: ${selectedComplaint.department || firstText(complaintRaw, ["department", "department_name"], "Not recorded")}`,
                                        `Original section: ${firstText(complaintRaw, ["section", "section_name"], "Not recorded")}`,
                                        `Complainant name: ${firstText(complaintRaw, ["complainant_name", "customer_name", "full_name", "name"], "Not recorded")}`,
                                        `Complainant contact: ${firstText(complaintRaw, ["contact_number", "phone", "telephone", "mobile"], "Not recorded")}`,
                                        `Complainant email: ${firstText(complaintRaw, ["email", "email_address"], "Not recorded")}`,
                                        `Service address: ${firstText(complaintRaw, ["address", "street_address", "physical_address", "service_address"], "Not recorded")}`,
                                        `Area / suburb: ${firstText(complaintRaw, ["area", "suburb", "town"], "Not recorded")}`,
                                        `Ward: ${firstText(complaintRaw, ["ward", "ward_number"], "Not recorded")}`,
                                        `Complaint description: ${firstText(complaintRaw, ["description", "details", "complaint_description", "issue_description", "narrative"], "Not recorded")}`,
                                        `Complaint status: ${selectedComplaint.status || "Not recorded"}`,
                                        `Requested department: ${assistanceDepartment}`,
                                        `Requested section: ${assistanceSection}`,
                                        `Assistance required: ${assistanceDetails.trim()}`,
                                        `Reason: ${assistanceReason.trim() || "Not provided"}`,
                                        `Recorded by: ${loggedInName || "Municipal staff"} (${loggedInRole || "Role not recorded"})`,
                                        `Requester department: ${loggedInDepartmentName || selectedComplaint.department || "Not recorded"}`,
                                        `Requester section: ${loggedInSectionName || "Not recorded"}`,
                                      ].join("\\n");
                                      const { error } = await supabase.from("complaint_updates").insert({
                                        complaint_id: selectedComplaint.id,
                                        updated_by: authResult.user.id,
                                        old_status: String(selectedComplaint.raw.status ?? selectedComplaint.status),
                                        new_status: String(selectedComplaint.raw.status ?? selectedComplaint.status),
                                        comment: requestNote,
                                        created_at: new Date().toISOString(),
                                      });
                                      if (error) throw error;
                                      setDepartmentAssistanceNotice(`Successfully updated the assistance request for complaint ${selectedComplaint.reference}. The request was recorded in the complaint history; no notification or reassignment was sent.`);
                                      setDepartmentAssistanceRefresh((value) => value + 1);
                                      setAssistanceDepartment("");
                                      setAssistanceSection("");
                                      setAssistanceDetails("");
                                      setAssistanceReason("");
                                    } catch (error) {
                                      setDepartmentAssistanceNotice(error instanceof Error ? error.message : "Could not record the department assistance request.");
                                    } finally {
                                      setSavingDepartmentAssistance(false);
                                    }
                                  }}
                                  className="rounded-xl bg-green-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {savingDepartmentAssistance ? "Recording…" : "Record assistance request"}
                                </button>
                              </div>
                            </div>
                          )}
                        </section>
                      )}

                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_26px_rgba(15,40,25,0.04)] sm:p-6">
                      <div className="mb-5 border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-extrabold text-slate-800">Update complaint details</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">Update the complaint details using the information confirmed by the assigned official or supervisor.</p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-600">Complaint subject <span className="text-red-600">*</span></span><input value={editSubject} onChange={(event) => setEditSubject(event.target.value)} required className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-100" /></label>
                        <label className="block sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-600">Description / details</span><textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={5} className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-100" /></label>
                        <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Department</span><select value={editDepartment} onChange={(event) => setEditDepartment(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100">{editDepartment && !departments.some((d) => d.name === editDepartment) && <option value={editDepartment}>{editDepartment}</option>}<option value="">Not assigned</option>{departments.map((department) => <option key={department.name} value={department.name}>{department.name}</option>)}</select></label>
                        <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">Status</span><select value={editStatus} onChange={(event) => setEditStatus(event.target.value as ComplaintStatus)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"><option>New</option><option>In Progress</option><option>Resolved</option></select></label>
                        <div className="flex items-start gap-2 rounded-xl bg-green-50 px-3.5 py-3 sm:col-span-2"><span className="mt-0.5 text-green-800">ⓘ</span><p className="text-xs leading-5 text-green-900">The reference number and reported date are preserved. Choose New, In Progress or Resolved. Your changes will be saved to the complaint record.</p></div>
                      </div>
                    </div>
                  )}
                </div>

                <footer className={`flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white ${complaintAction === "view" ? "px-[12mm] py-[6mm]" : "px-5 py-5 sm:px-9"}`}>
                  <button
                    type="button"
                    onClick={closeComplaintAction}
                    disabled={savingComplaint || savingOperationalUpdate || savingAssignment}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Close
                  </button>
                  {complaintAction === "edit" && !isSupervisorDashboard && (
                    <button
                      type="button"
                      onClick={() => void handleSaveComplaint()}
                      disabled={savingComplaint}
                      className="rounded-xl bg-green-800 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-900 focus:outline-none focus:ring-4 focus:ring-green-800/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingComplaint ? "Saving changes…" : "Save changes"}
                    </button>
                  )}
                </footer>
              </section>
            </div>
          )}

          {/* FOOTER */}
          <footer className="mt-9 flex flex-col items-center justify-between gap-3 border-t border-slate-200 py-5 sm:flex-row">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-800" />
              <span className="h-2 w-2 rounded-full bg-[#F2C94C]" />
              <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Emalahleni Local Municipality
              </span>
            </div>
          </footer>
        </div>
      </div>
      {/* BOTTOM BRAND STRIPE */}
      <div className="fixed bottom-0 left-0 z-[60] h-1 w-full bg-green-950">
        <div className="h-full w-[28%] bg-[#F2C94C]" />
      </div>
    </main>
  );
}
function NavItem({
  href,
  label,
  icon,
  active = false,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: IconName;
  active?: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-all duration-200 ${
        active
          ? "bg-white/10 text-white shadow-sm shadow-black/10"
          : "text-white/85 hover:bg-white/10 hover:text-white"
      }`}
    >
      {active && (
        <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-white/80" />
      )}
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          active
            ? "bg-white/10 text-[#FFE082]"
            : "bg-white/10 text-white/70 group-hover:bg-white/15 group-hover:text-[#FFE082]"
        }`}
      >
        <Icon name={icon} />
      </span>
      <span className="min-w-0 flex-1 text-[11px] font-bold">{label}</span>
      <span
        className={`transition group-hover:translate-x-0.5 ${
          active
            ? "text-white/70"
            : "text-white/40 opacity-0 group-hover:opacity-100 group-hover:text-white/80"
        }`}
      >
        <Icon name="arrow" />
      </span>
    </Link>
  );
}
function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-green-800">
          {eyebrow}
        </p>
        <h3 className="mt-1 text-base font-extrabold tracking-tight text-slate-900">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
function HeroMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="flex items-center gap-3 border-white/10 sm:border-l sm:pl-4 first:sm:border-l-0 first:sm:pl-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-base font-extrabold text-[#FFE082]">
        {value}
      </div>
      <div>
        <p className="text-xs font-bold text-white">{label}</p>
        <p className="mt-0.5 text-[10px] text-green-50/70">{note}</p>
      </div>
    </div>
  );
}
function SummaryCard({
  title,
  value,
  description,
  icon,
  tone,
}: {
  title: string;
  value: number;
  description: string;
  icon: IconName;
  tone: "green" | "yellow" | "blue";
}) {
  const styles = {
    green: {
      icon: "bg-green-50 text-green-800",
      accent: "bg-green-700",
    },
    yellow: {
      icon: "bg-amber-50 text-amber-700",
      accent: "bg-[#F2C94C]",
    },
    blue: {
      icon: "bg-blue-50 text-blue-700",
      accent: "bg-blue-600",
    },
  };
  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`absolute inset-x-0 top-0 h-1 ${styles[tone].accent}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
            {value}
          </p>
          <p className="mt-2 text-[11px] text-slate-500">{description}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles[tone].icon}`}>
          <Icon name={icon} />
        </div>
      </div>
    </div>
  );
}
function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 text-center ${
        compact ? "min-h-[190px] py-7" : "min-h-[220px] py-8"
      }`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-50 text-green-800 ring-1 ring-green-100">
        <Icon name={icon} />
      </div>
      <h4 className="mt-4 text-sm font-extrabold text-slate-800">{title}</h4>
      <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">
        {description}
      </p>
      {action}
    </div>
  );
}
function TableHeading({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <th className="px-3 py-3 text-left text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 first:pl-5">
      {children}
    </th>
  );
}
function DetailField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`${wide ? "sm:col-span-2 " : ""}min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 transition-colors hover:border-green-200 hover:bg-green-50/30 sm:p-3`}>
      <p className="min-w-0 break-words text-[10px] font-extrabold uppercase tracking-[0.11em] text-slate-500">{label}</p>
      <p className="mt-1 min-w-0 break-words [overflow-wrap:anywhere] whitespace-pre-wrap text-sm font-medium leading-5 text-slate-800">{value && value.trim() ? value : "Not provided"}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ComplaintStatus }) {
  const styles: Record<ComplaintStatus, string> = {
    Received: "text-blue-700",
    New: "text-blue-700",
    Assigned: "text-amber-700",
    "In Progress": "text-green-800",
    "In Process": "text-green-800",
    Completed: "text-green-700",
    Resolved: "text-slate-600",
  };
  return (
    <span className={`text-[10px] font-bold ${styles[status]}`}>
      {status}
    </span>
  );
}
function PriorityBadge({ priority }: { priority: ComplaintPriority }) {
  const styles: Record<ComplaintPriority, string> = {
    Low: "text-slate-600",
    Medium: "text-amber-700",
    High: "text-orange-700",
    Critical: "text-red-700",
  };
  return (
    <span className={`text-[10px] font-bold ${styles[priority]}`}>
      {priority}
    </span>
  );
}
function Icon({ name }: { name: IconName }) {
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
  const paths: Record<IconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="4" rx="1.5" />
        <rect x="14" y="10" width="7" height="11" rx="1.5" />
        <rect x="3" y="13" width="7" height="8" rx="1.5" />
      </>
    ),
    complaints: (
      <>
        <path d="M8 10h8M8 14h5" />
        <path d="M20 11.5a8 8 0 1 1-3.2-6.4" />
        <path d="m15 3 3 3 3-3" />
      </>
    ),
    requests: (
      <>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    departments: (
      <>
        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5" />
        <path d="M9 9h.01M15 9h.01M9 12h.01M15 12h.01" />
      </>
    ),
    reports: (
      <>
        <path d="M4 19V5M4 19h17" />
        <path d="M8 16v-4m4 4V8m4 8v-6m4 6V4" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.8 3.12-.09-.03a1.7 1.7 0 0 0-1.82.47l-.07.08h-3.6l-.02-.1a1.7 1.7 0 0 0-1.3-1.32l-.1-.02-1.8-3.12.07-.07a1.7 1.7 0 0 0 0-2.4l-.07-.07 1.8-3.12.1-.02a1.7 1.7 0 0 0 1.3-1.32l.02-.1h3.6l.07.08a1.7 1.7 0 0 0 1.82.47l.09-.03 1.8 3.12-.06.06A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    building: (
      <>
        <path d="M3 21h18M5 21V7l7-4 7 4v14" />
        <path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
      </>
    ),
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  };
  return (
    
    <svg {...common}>
      {paths[name]}
    </svg>
  );                                             
}                                                               
                  