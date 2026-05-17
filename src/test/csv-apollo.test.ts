import { describe, it, expect } from "vitest";
import { csvToContacts } from "@/lib/csv";

describe("csvToContacts — Apollo export headers", () => {
  it("maps Apollo column names to contact fields", () => {
    const csv = [
      "First Name,Last Name,Title,Company Name,Email,Email Status,Work Direct Phone,Mobile Phone,Person Linkedin Url,Website,Industry,# Employees,Annual Revenue,City,State,Country,Company City",
      'Michael,More,Director of Career Services,Northeastern University,michael.m@northeastern.edu,valid,+1 206-221-8423,,http://www.linkedin.com/in/michael-more,https://northeastern.edu,higher education,18000,"2,487,186,000",Seattle,Washington,United States,Boston',
    ].join("\n");

    const result = csvToContacts(csv);
    expect(result.skipped).toHaveLength(0);
    expect(result.rows).toHaveLength(1);

    const row = result.rows[0];
    expect(row.first_name).toBe("Michael");
    expect(row.last_name).toBe("More");
    expect(row.company).toBe("Northeastern University");
    expect(row.email).toBe("michael.m@northeastern.edu");
    expect(row.email_status).toBe("valid");
    expect(row.work_phone).toBe("+1 206-221-8423");
    expect(row.linkedin).toBe("http://www.linkedin.com/in/michael-more");
    expect(row.employees).toBe(18000);
    expect(row.annual_revenue).toBe(2487186000);
    expect(row.company_city).toBe("Boston");
  });

  it("normalises catch-all email status", () => {
    const csv = [
      "First Name,Company Name,Email,Email Status",
      "Faith,Quinsigamond Community College,fwong@qcc.mass.edu,catch-all",
    ].join("\n");
    const result = csvToContacts(csv);
    expect(result.rows[0].email_status).toBe("catchall");
  });
});
