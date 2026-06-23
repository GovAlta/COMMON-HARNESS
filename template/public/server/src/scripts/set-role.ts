/**
 * Set a user's role by email address.
 *
 * Usage:
 *   npx tsx src/scripts/set-role.ts <email> <role>
 *
 * Examples:
 *   npx tsx src/scripts/set-role.ts you@example.com admin
 *   npx tsx src/scripts/set-role.ts you@example.com editor
 *
 * The role list MUST stay aligned with server/src/middleware/authorize.ts
 * ROLE_HIERARCHY and migrations/019_expand_role_check.sql.
 */

import { pool } from '../config/database';
import { ROLE_HIERARCHY } from '../middleware/authorize';

async function main() {
  const [, , email, role] = process.argv;

  if (!email || !role) {
    console.log('Usage: npx tsx src/scripts/set-role.ts <email> <role>');
    console.log(`Roles: ${ROLE_HIERARCHY.join(', ')}`);
    console.log('Example: npx tsx src/scripts/set-role.ts user@example.com admin');
    process.exit(1);
  }

  if (!ROLE_HIERARCHY.includes(role)) {
    console.error(`Invalid role "${role}". Valid roles: ${ROLE_HIERARCHY.join(', ')}`);
    process.exit(1);
  }

  try {
    // Check if user exists
    const check = await pool.query(
      'SELECT pk_user_account, user_email_address, user_role_name FROM user_account WHERE user_email_address = $1 AND is_deleted = false',
      [email]
    );

    if (check.rows.length === 0) {
      console.error(`No user found with email: ${email}`);
      console.log('\nRegistered users:');
      const all = await pool.query(
        'SELECT user_email_address, user_role_name FROM user_account WHERE is_deleted = false ORDER BY created_at'
      );
      all.rows.forEach((u) => console.log(`  ${u.user_email_address} [${u.user_role_name}]`));
      process.exit(1);
    }

    const user = check.rows[0];
    if (user.user_role_name === role) {
      console.log(`User ${email} already has role "${role}". No change needed.`);
      process.exit(0);
    }

    // Update role
    await pool.query(
      'UPDATE user_account SET user_role_name = $1 WHERE pk_user_account = $2',
      [role, user.pk_user_account]
    );

    console.log(`Updated ${email}: ${user.user_role_name} -> ${role}`);
    console.log('\nThe user must log out and back in for the new role to take effect (JWT refresh).');
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
