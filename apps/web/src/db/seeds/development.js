import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { DEVELOPMENT_USERS, PORTFOLIO_ITEMS, SERVICE_FIXTURES } from "./catalog-data.js";

const thisFile = fileURLToPath(import.meta.url);

/**
 * Populate only explicitly enabled development fixtures. This function does
 * not create passwords: login fixtures are intentionally omitted.
 *
 * @param {{ transaction?: (callback: (tx: any) => Promise<unknown>) => Promise<unknown> }} database
 */
export async function seedDevelopmentDatabase(database) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development seed cannot run in production");
  }
  if (process.env.DEVELOPMENT_SEED_ENABLED !== "true") {
    throw new Error("Development seed is disabled; set DEVELOPMENT_SEED_ENABLED=true explicitly");
  }
  if (typeof database?.transaction !== "function") {
    throw new TypeError("A Drizzle database with transaction support is required");
  }

  return database.transaction(async (transaction) => {
    const userIds = new Map();
    for (const user of DEVELOPMENT_USERS) {
      const rows = await transaction.execute(sql`
        insert into users (name, email_normalized, role, status)
        values (${user.name}, ${user.email}, ${user.role}::user_role, 'ACTIVE'::user_status)
        on conflict (email_normalized) do update set
          name = excluded.name,
          role = excluded.role,
          status = excluded.status,
          updated_at = now()
        returning id
      `);
      userIds.set(user.email, rows.rows[0].id);
    }

    const employeeIds = [];
    for (const user of DEVELOPMENT_USERS.filter(({ role }) => role === "EMPLOYEE")) {
      const rows = await transaction.execute(sql`
        insert into employees (user_id, display_name, specialty_summary, status)
        values (${userIds.get(user.email)}, ${user.name}, ${user.specialty}, 'ACTIVE'::employee_status)
        on conflict (user_id) do update set
          display_name = excluded.display_name,
          specialty_summary = excluded.specialty_summary,
          status = excluded.status,
          updated_at = now()
        returning id
      `);
      employeeIds.push(rows.rows[0].id);
    }

    const serviceIds = [];
    for (const service of SERVICE_FIXTURES) {
      const existing = await transaction.execute(sql`
        select id from services where name = ${service.name} limit 1
      `);
      const rows = existing.rows.length
        ? await transaction.execute(sql`
            update services
               set category = ${service.category}::service_category,
                   duration_minutes = ${service.durationMinutes},
                   preparation_minutes = 0,
                   price_cents = ${service.priceCents},
                   price_verified_at = null,
                   active = true,
                   updated_at = now()
             where id = ${existing.rows[0].id}
             returning id
          `)
        : await transaction.execute(sql`
            insert into services
              (name, category, duration_minutes, preparation_minutes, price_cents, price_verified_at, active)
            values
              (${service.name}, ${service.category}::service_category, ${service.durationMinutes}, 0, ${service.priceCents}, null, true)
            returning id
          `);
      serviceIds.push(rows.rows[0].id);
    }

    for (const employeeId of employeeIds) {
      for (const serviceId of serviceIds) {
        await transaction.execute(sql`
          insert into employee_services (employee_id, service_id, enabled)
          values (${employeeId}, ${serviceId}, true)
          on conflict (employee_id, service_id) do update set enabled = true, updated_at = now()
        `);
      }
    }

    for (const [displayOrder, item] of PORTFOLIO_ITEMS.entries()) {
      await transaction.execute(sql`
        insert into portfolio_items (asset_path, category, alternative_text, display_order, active)
        values (${item.assetPath}, ${item.category}::service_category, ${item.alternativeText}, ${displayOrder}, true)
        on conflict (asset_path) do update set
          category = excluded.category,
          alternative_text = excluded.alternative_text,
          display_order = excluded.display_order,
          active = excluded.active
      `);
    }

    for (const user of DEVELOPMENT_USERS.filter(({ role }) => role === "CLIENT")) {
      for (const slotNumber of [1, 2, 3]) {
        await transaction.execute(sql`
          insert into cancellation_credits (client_id, slot_number)
          values (${userIds.get(user.email)}, ${slotNumber})
          on conflict (client_id, slot_number) do nothing
        `);
      }
    }

    return { serviceCount: serviceIds.length, portfolioCount: PORTFOLIO_ITEMS.length, employeeCount: employeeIds.length };
  });
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === thisFile;

if (isMainModule) {
  const { db, pool } = await import("../client.js");
  try {
    await seedDevelopmentDatabase(db);
  } finally {
    await pool?.end();
  }
}
