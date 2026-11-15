

"use client";



import { useMemo, useState } from "react";

import type { FormEvent, ReactNode } from "react";



type ComplaintForm = {

  accountNumber: string;

  fullName: string;

  contactNumber: string;

  email: string;

  preferredContact: string;

  address: string;

  area: string;

  ward: string;

  subject: string;

  description: string;

  receivedChannel: string;

  dateReported: string;

  department: string;

  section: string;

  priority: string;

};



type RouteOption = {

  subject: string;

  department: string;

  section: string;

};



const initialForm: ComplaintForm = {

  accountNumber: "",

  fullName: "",

  contactNumber: "",

  email: "",

  preferredContact: "SMS",

  address: "",

  area: "",

  ward: "",

  subject: "",

  description: "",

  receivedChannel: "Web Portal",

  dateReported: new Date().toLocaleDateString("en-CA"),

  department: "",

  section: "",

  priority: "Medium",

};



/*

 * Public complaint subjects.

 * Keep these subject names and routing destinations aligned

 * with the Call Centre Agent complaint form and Supabase catalogue.

 */

const complaintRoutes: RouteOption[] = [

  // TECHNICAL SERVICES

  { subject: "No water supply", department: "Technical Services", section: "Water Supply" },

  { subject: "Low water pressure", department: "Technical Services", section: "Water Supply" },

  { subject: "Burst water pipe or water leak", department: "Technical Services", section: "Water Supply" },

  { subject: "Water discolouration or water quality concern", department: "Technical Services", section: "Water Supply" },

  { subject: "Damaged water meter or water infrastructure", department: "Technical Services", section: "Water Supply" },

  { subject: "Blocked sewer line", department: "Technical Services", section: "Sanitation and Sewerage" },

  { subject: "Sewer overflow or sewage spill", department: "Technical Services", section: "Sanitation and Sewerage" },

  { subject: "Sewage smell from municipal infrastructure", department: "Technical Services", section: "Sanitation and Sewerage" },

  { subject: "Damaged or missing manhole cover", department: "Technical Services", section: "Sanitation and Sewerage" },

  { subject: "Pothole or damaged municipal road", department: "Technical Services", section: "Roads and Stormwater" },

  { subject: "Damaged road surface or shoulder", department: "Technical Services", section: "Roads and Stormwater" },

  { subject: "Damaged road sign or road marking", department: "Technical Services", section: "Roads and Stormwater" },

  { subject: "Flooded road or street", department: "Technical Services", section: "Roads and Stormwater" },

  { subject: "Blocked stormwater drain", department: "Technical Services", section: "Roads and Stormwater" },

  { subject: "Street light not working", department: "Technical Services", section: "Electrical" },

  { subject: "Multiple street lights not working", department: "Technical Services", section: "Electrical" },

  { subject: "Electricity supply fault on municipal infrastructure", department: "Technical Services", section: "Electrical" },

  { subject: "Damaged electrical pole, cable or box", department: "Technical Services", section: "Electrical" },

  { subject: "Exposed or dangerous electrical wires", department: "Technical Services", section: "Electrical" },



  // FINANCE

  { subject: "Incorrect municipal account or bill", department: "Finance", section: "Billing" },

  { subject: "Unexpectedly high water charges", department: "Finance", section: "Billing" },

  { subject: "Unexpectedly high electricity charges", department: "Finance", section: "Billing" },

  { subject: "Meter reading dispute", department: "Finance", section: "Revenue Protection" },

  { subject: "Estimated or missing meter reading", department: "Finance", section: "Revenue Protection" },

  { subject: "Water account query", department: "Finance", section: "Billing" },

  { subject: "Electricity account query", department: "Finance", section: "Billing" },

  { subject: "Incorrect property rates or valuation", department: "Finance", section: "Property Rates" },

  { subject: "Payment not reflected on account", department: "Finance", section: "Payments & Receipts" },

  { subject: "Incorrect account balance", department: "Finance", section: "Payments & Receipts" },

  { subject: "Refund query or delayed refund", department: "Finance", section: "Payments & Receipts" },

  { subject: "Disconnection or restriction dispute", department: "Finance", section: "Credit Control" },



  // DEVELOPMENT PLANNING

  { subject: "Building work without approved plans", department: "Development Planning", section: "Building Control" },

  { subject: "Unsafe building or structural concern", department: "Development Planning", section: "Building Control" },

  { subject: "Building plan approval enquiry or delay", department: "Development Planning", section: "Building Control" },

  { subject: "Illegal land use or zoning concern", department: "Development Planning", section: "Land Use Management" },

  { subject: "Unauthorised change of property use", department: "Development Planning", section: "Land Use Management" },

  { subject: "Property development or subdivision enquiry", department: "Development Planning", section: "Town Planning" },



  // COMMUNITY SERVICES

  { subject: "Damaged municipal park or playground", department: "Community Services", section: "Parks and Public Open Spaces" },

  { subject: "Overgrown grass or vegetation in public park", department: "Community Services", section: "Parks and Public Open Spaces" },

  { subject: "Damaged playground equipment", department: "Community Services", section: "Parks and Public Open Spaces" },

  { subject: "Damaged community hall or public facility", department: "Community Services", section: "Community Facilities" },

  { subject: "Community facility maintenance problem", department: "Community Services", section: "Community Facilities" },

  { subject: "Cemetery maintenance or cleanliness problem", department: "Community Services", section: "Cemeteries" },

  { subject: "Cemetery booking or burial service enquiry", department: "Community Services", section: "Cemeteries" },

  { subject: "Library service or facility complaint", department: "Community Services", section: "Libraries" },

  { subject: "Sport field or recreation facility damaged", department: "Community Services", section: "Sports and Recreation" },

  { subject: "Faulty traffic signal or traffic light", department: "Community Services", section: "Traffic Management" },

  { subject: "Traffic sign damaged, missing or obscured", department: "Community Services", section: "Traffic Management" },

  { subject: "Illegal trading or trading without a permit", department: "Community Services", section: "Law Enforcement" },

  { subject: "Municipal by-law violation", department: "Community Services", section: "Law Enforcement" },

  { subject: "Obstruction of a pavement or public space", department: "Community Services", section: "Law Enforcement" },



  // ENVIRONMENTAL AND WASTE

  { subject: "Missed household refuse collection", department: "Environmental and Waste", section: "Waste Management" },

  { subject: "Refuse collection schedule not followed", department: "Environmental and Waste", section: "Waste Management" },

  { subject: "Waste left behind after collection", department: "Environmental and Waste", section: "Waste Management" },

  { subject: "Illegal dumping on public land", department: "Environmental and Waste", section: "Waste Management" },

  { subject: "Overflowing communal refuse point", department: "Environmental and Waste", section: "Waste Management" },

  { subject: "Environmental pollution or public nuisance", department: "Environmental and Waste", section: "Environmental Management & Compliance" },

  { subject: "Unhygienic premises or suspected public health hazard", department: "Environmental and Waste", section: "Environmental Management & Compliance" },

  { subject: "Pest or rodent concern linked to unsanitary conditions", department: "Environmental and Waste", section: "Environmental Management & Compliance" },



  // CORPORATE SERVICES — public enquiries

  { subject: "Municipal bursary application enquiry", department: "Corporate Services", section: "Youth Development and Training" },

  { subject: "Bursary application status or delayed feedback", department: "Corporate Services", section: "Youth Development and Training" },

  { subject: "Bursary eligibility or required documents enquiry", department: "Corporate Services", section: "Youth Development and Training" },

  { subject: "Municipal vacancy or recruitment advert enquiry", department: "Corporate Services", section: "Human Resources" },

  { subject: "Job application submission or acknowledgement issue", department: "Corporate Services", section: "Human Resources" },

];



const departments = [

  "Technical Services",

  "Finance",

  "Corporate Services",

  "Development Planning",

  "Community Services",

  "Environmental and Waste",

];



const wards = Array.from({ length: 34 }, (_, index) => `Ward ${index + 1}`);



const inputClass =

  "w-full min-h-[48px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-green-700 focus:ring-4 focus:ring-green-700/10 disabled:cursor-not-allowed disabled:bg-slate-50";



function SectionHeading({

  number,

  title,

}: {

  number: string;

  title: string;

}) {

  return (

    <div className="mb-8">

      <div className="flex items-center gap-3">

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-700 to-green-900 text-sm font-extrabold text-white shadow-sm">

          {number}

        </div>

        <h2 className="text-lg font-extrabold tracking-tight text-green-950 sm:text-xl">

          {title}

        </h2>

      </div>

      <div className="ml-14 mt-3 h-1 w-14 rounded-full bg-yellow-400" />

    </div>

  );

}



function Field({

  label,

  required,

  children,

  className = "",

}: {

  label: string;

  required?: boolean;

  children: ReactNode;

  className?: string;

}) {

  return (

    <div className={className}>

      <label className="mb-2 block text-sm font-semibold text-slate-700">

        {label}

        {required && <span className="ml-1 text-red-500">*</span>}

      </label>

      {children}

    </div>

  );

}



export default function ComplainantPage() {

  const [form, setForm] = useState<ComplaintForm>(initialForm);

  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [successReference, setSuccessReference] = useState("");



  const availableSubjects = useMemo(

    () => complaintRoutes.filter((item) => item.department === form.department),

    [form.department]

  );



  const availableSections = useMemo(

    () => Array.from(new Set(availableSubjects.map((item) => item.section))),

    [availableSubjects]

  );



  const subjectsForSection = useMemo(

    () => availableSubjects.filter((item) => item.section === form.section),

    [availableSubjects, form.section]

  );



  function updateField<K extends keyof ComplaintForm>(

    field: K,

    value: ComplaintForm[K]

  ) {

    setForm((previous) => ({ ...previous, [field]: value }));

  }



  function handleDepartmentChange(department: string) {

    setForm((previous) => ({

      ...previous,

      department,

      section: "",

      subject: "",

    }));

  }



  function handleSectionChange(section: string) {

    setForm((previous) => ({

      ...previous,

      section,

      subject: "",

    }));

  }



  async function handleSubmit(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();

    if (submitting) return;



    setErrorMessage("");

    setSuccessReference("");



    if (!form.fullName.trim()) {

      setErrorMessage("Please enter your full name.");

      return;

    }



    if (!/^0\d{9}$/.test(form.contactNumber.trim())) {

      setErrorMessage("Please enter a valid 10-digit South African contact number.");

      return;

    }



    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {

      setErrorMessage("Please enter a valid email address.");

      return;

    }



    if (form.accountNumber && !/^\d{1,10}$/.test(form.accountNumber.trim())) {

      setErrorMessage("Account number must contain numbers only and must not exceed 10 digits.");

      return;

    }



    if (!form.area.trim() || !form.address.trim() || !form.ward) {

      setErrorMessage("Please complete the area, ward and address fields.");

      return;

    }



    if (!form.department || !form.section || !form.subject) {

      setErrorMessage("Please select the department, section and complaint subject.");

      return;

    }



    if (!form.description.trim()) {

      setErrorMessage("Please describe the complaint.");

      return;

    }



    const selectedRoute = complaintRoutes.find(

      (item) =>

        item.subject === form.subject &&

        item.department === form.department &&

        item.section === form.section

    );



    if (!selectedRoute) {

      setErrorMessage("The selected complaint does not have a valid departmental routing rule.");

      return;

    }



    setSubmitting(true);



    try {

      const payload: ComplaintForm = {

        ...form,

        accountNumber: form.accountNumber.trim(),

        fullName: form.fullName.trim(),

        contactNumber: form.contactNumber.trim(),

        email: form.email.trim(),

        address: form.address.trim(),

        area: form.area.trim(),

        subject: selectedRoute.subject,

        description: form.description.trim(),

        receivedChannel: "Web Portal",

        dateReported: new Date().toLocaleDateString("en-CA"),

        department: selectedRoute.department,

        section: selectedRoute.section,

        priority: "Medium",

      };



      const response = await fetch("/api/public-complaints", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          Accept: "application/json",

        },

        body: JSON.stringify(payload),

      });



      const result = await response.json().catch(() => ({}));



      if (!response.ok) {

        throw new Error(result.error || "Your complaint could not be submitted.");

      }



      if (!result.referenceNumber) {

        throw new Error(

          "The complaint was submitted, but no reference number was returned. Please contact the municipality."

        );

      }



      setSuccessReference(result.referenceNumber);

      setForm({

        ...initialForm,

        dateReported: new Date().toLocaleDateString("en-CA"),

      });

    } catch (error) {

      setErrorMessage(

        error instanceof Error

          ? error.message

          : "Unable to submit your complaint. Please try again."

      );

    } finally {

      setSubmitting(false);

    }

  }



  return (

    <main className="min-h-screen bg-[#f4f8f5] text-slate-800">

      <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 lg:px-8">

        <header className="mb-9">

          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-green-700">

            Emalahleni Local Municipality

          </p>

          <h1 className="text-3xl font-extrabold tracking-tight text-green-950 sm:text-4xl">

            Log a Fault Online

          </h1>

          <div className="mt-4 h-1 w-16 rounded-full bg-yellow-400" />

          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">

            Submit a municipal service complaint directly to Emalahleni Local

            Municipality. Please provide accurate contact and location

            information so that your complaint can be routed to the correct team.

          </p>

        </header>



        <section

          id="problem-form"

          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"

        >

          <div className="border-b border-slate-100 px-5 py-6 sm:px-8">


          </div>



          <form onSubmit={handleSubmit} className="p-5 sm:p-8">

            <section className="mb-10">

              <SectionHeading number="01" title="Complainant Information" />



              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">

                <Field label="Account Number">

                  <input

                    type="text"

                    inputMode="numeric"

                    className={inputClass}

                    value={form.accountNumber}

                    onChange={(event) =>

                      updateField("accountNumber", event.target.value.replace(/\D/g, "").slice(0, 10))

                    }

                    placeholder="Enter account number if applicable"

                    maxLength={10}

                  />

                </Field>



                <Field label="Full Name" required>

                  <input

                    type="text"

                    className={inputClass}

                    value={form.fullName}

                    onChange={(event) => updateField("fullName", event.target.value)}

                    placeholder="Enter full name"

                    maxLength={150}

                    autoComplete="name"

                    required

                  />

                </Field>



                <Field label="Contact Number" required>

                  <input

                    type="tel"

                    inputMode="numeric"

                    className={inputClass}

                    value={form.contactNumber}

                    onChange={(event) =>

                      updateField("contactNumber", event.target.value.replace(/\D/g, "").slice(0, 10))

                    }

                    placeholder="e.g. 0821234567"

                    pattern="0[0-9]{9}"

                    maxLength={10}

                    autoComplete="tel"

                    required

                  />

                </Field>



                <Field label="Email Address">

                  <input

                    type="email"

                    className={inputClass}

                    value={form.email}

                    onChange={(event) => updateField("email", event.target.value)}

                    placeholder="Enter email address"

                    maxLength={254}

                    autoComplete="email"

                  />

                </Field>



                <Field label="Preferred Contact Method" required>

                  <select

                    className={inputClass}

                    value={form.preferredContact}

                    onChange={(event) => updateField("preferredContact", event.target.value)}

                    required

                  >

                    <option value="SMS">SMS</option>

                    <option value="Email">Email</option>

                  </select>

                </Field>



                <Field label="Area / Suburb" required>

                  <input

                    type="text"

                    className={inputClass}

                    value={form.area}

                    onChange={(event) => updateField("area", event.target.value)}

                    placeholder="Enter area or suburb"

                    maxLength={150}

                    required

                  />

                </Field>



                <Field label="Ward" required>

                  <select

                    className={inputClass}

                    value={form.ward}

                    onChange={(event) => updateField("ward", event.target.value)}

                    required

                  >

                    <option value="">Select ward</option>

                    {wards.map((ward) => (

                      <option key={ward} value={ward}>{ward}</option>

                    ))}

                  </select>

                </Field>



                <Field label="Residential / Postal Address" required className="md:col-span-2">

                  <input

                    type="text"

                    className={inputClass}

                    value={form.address}

                    onChange={(event) => updateField("address", event.target.value)}

                    placeholder="Enter residential or postal address"

                    maxLength={300}

                    autoComplete="street-address"

                    required

                  />

                </Field>

              </div>

            </section>



            <section className="mb-10 border-t border-slate-100 pt-8">

              <SectionHeading number="02" title="Complaint Information" />



              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">

                <Field label="Department" required>

                  <select

                    className={inputClass}

                    value={form.department}

                    onChange={(event) => handleDepartmentChange(event.target.value)}

                    required

                  >

                    <option value="">Select department</option>

                    {departments.map((department) => (

                      <option key={department} value={department}>{department}</option>

                    ))}

                  </select>

                </Field>



                <Field label="Section" required>

                  <select

                    className={inputClass}

                    value={form.section}

                    onChange={(event) => handleSectionChange(event.target.value)}

                    disabled={!form.department}

                    required

                  >

                    <option value="">

                      {form.department ? "Select section" : "Select department first"}

                    </option>

                    {availableSections.map((section) => (

                      <option key={section} value={section}>{section}</option>

                    ))}

                  </select>

                </Field>



                <Field label="Complaint Subject" required>

                  <select

                    className={inputClass}

                    value={form.subject}

                    onChange={(event) => updateField("subject", event.target.value)}

                    disabled={!form.section}

                    required

                  >

                    <option value="">

                      {form.section ? "Select complaint subject" : "Select section first"}

                    </option>

                    {subjectsForSection.map((item) => (

                      <option key={item.subject} value={item.subject}>

                        {item.subject}

                      </option>

                    ))}

                  </select>

                </Field>



                <Field label="Describe the Complaint" required className="md:col-span-2 lg:col-span-3">

                  <textarea

                    className={`${inputClass} min-h-36 resize-y`}

                    value={form.description}

                    onChange={(event) => updateField("description", event.target.value)}

                    placeholder="Describe what happened, when it happened and any relevant details..."

                    maxLength={5000}

                    required

                  />

                </Field>

              </div>

            </section>



            {successReference && (

              <div

                role="status"

                className="mb-6 rounded-xl border border-green-200 bg-green-50 p-5"

              >

                <div className="flex items-start gap-3">

                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-700 text-white">

                    ✓

                  </span>

                  <div>

                    <h3 className="font-bold text-green-900">

                      Complaint submitted successfully

                    </h3>

                    <p className="mt-2 text-sm text-green-800">

                      Your complaint reference number is:

                    </p>

                    <p className="mt-1 text-2xl font-extrabold tracking-wide text-green-950">

                      {successReference}

                    </p>

                    <p className="mt-2 text-xs text-green-700">

                      Please keep this reference number for future enquiries.

                    </p>

                  </div>

                </div>

              </div>

            )}



            {errorMessage && (

              <div

                role="alert"

                className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"

              >

                {errorMessage}

              </div>

            )}



            <div className="flex flex-col-reverse gap-4 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">

              <p className="text-xs text-slate-500">

                Fields marked with <span className="font-bold text-red-500">*</span> are mandatory.

              </p>



              <button

                type="submit"

                disabled={submitting}

                className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-green-800 px-8 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-green-900 focus:outline-none focus:ring-4 focus:ring-green-700/20 disabled:cursor-not-allowed disabled:opacity-60"

              >

                {submitting ? "Submitting complaint..." : "Submit Complaint"}

                {!submitting && <span aria-hidden="true">→</span>}

              </button>

            </div>

          </form>

        </section>



        <footer className="mt-8 border-t border-slate-200 py-6 text-center">

          <p className="text-xs text-slate-500">

            Emalahleni Local Municipality

          </p>

        </footer>

      </div>

    </main>

  );

}
