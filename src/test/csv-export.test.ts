import { describe, it, expect } from "vitest";
import { contactsToCsv, parseCsv, csvToContacts } from "@/lib/csv";
import type { Contact } from "@/lib/types";

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    first_name: "Michael",
    last_name: "More",
    email: "michael.m@northeastern.edu",
    email_status: "valid",
    work_phone: "+1 206-221-8423",
    mobile_phone: null,
    corporate_phone: null,
    other_phone: null,
    company_phone: null,
    secondary_email: null,
    keywords: null,
    title: "Director of Career Services",
    company: "Northeastern University",
    industry: "higher education",
    employees: 18000,
    annual_revenue: 2487186000,
    website: "https://northeastern.edu",
    linkedin: "http://www.linkedin.com/in/michael-more",
    company_linkedin: null,
    facebook_url: null,
    twitter_url: null,
    city: "Seattle",
    state: "Washington",
    country: "United States",
    company_address: null,
    company_city: "Boston",
    company_state: null,
    company_country: null,
    tags: ["target-list", "q1-priority"],
    pipeline_stage: "new",
    owner_id: "nf@winning.careers",
    created_by: "nf@winning.careers",
    updated_by: "nf@winning.careers",
    last_activity_at: null,
    search_blob: "",
    created_at: "2026-05-17T00:00:00Z",
    updated_at: "2026-05-17T00:00:00Z",
    ...overrides,
  };
}

describe("contactsToCsv — export columns", () => {
  it("emits a header row with all enrichment columns", () => {
    const csv = contactsToCsv([makeContact()]);
    const header = parseCsv(csv)[0];
    for (const col of [
      "First Name", "Last Name", "Title", "Company", "Email", "Email Status",
      "Work Phone", "Mobile Phone", "LinkedIn", "Website", "Industry",
      "# Employees", "Annual Revenue", "City", "State", "Country",
      "Company City", "Tags", "Stage",
    ]) {
      expect(header).toContain(col);
    }
  });

  it("uses CRLF line endings per RFC 4180", () => {
    const csv = contactsToCsv([makeContact()]);
    expect(csv.includes("\r\n")).toBe(true);
  });

  it("round-trips enrichment fields through export → import", () => {
    const original = makeContact();
    const csv = contactsToCsv([original]);
    const reimported = csvToContacts(csv);
    expect(reimported.rows).toHaveLength(1);
    const row = reimported.rows[0];
    expect(row.first_name).toBe("Michael");
    expect(row.company).toBe("Northeastern University");
    expect(row.email_status).toBe("valid");
    expect(row.employees).toBe(18000);
    expect(row.annual_revenue).toBe(2487186000);
    expect(row.company_city).toBe("Boston");
    expect(row.tags).toEqual(["target-list", "q1-priority"]);
  });

  it("escapes quotes, commas, and newlines correctly", () => {
    const csv = contactsToCsv([
      makeContact({ company: 'Acme, "the" Inc', title: "VP\nOps" }),
    ]);
    const rows = parseCsv(csv);
    expect(rows[1]).toContain('Acme, "the" Inc');
    expect(rows[1]).toContain("VP\nOps");
  });
});
