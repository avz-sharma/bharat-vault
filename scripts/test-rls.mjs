import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
const db = new PGlite({ extensions: { uuid_ossp } });
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
 GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;`);
for (const file of [
  "001_initial_schema.sql",
  "002_verified_identity_boundary.sql",
])
  await db.exec(await readFile(`backend/supabase/migrations/${file}`, "utf8"));
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const auditor = "33333333-3333-4333-8333-333333333333";
await db.query("INSERT INTO auth.users VALUES ($1), ($2), ($3)", [
  alice,
  bob,
  auditor,
]);
const link = (
  await db.query(
    `INSERT INTO auth_identity_links(user_id,chain_id,did,controller,proof_time,expires_at)
 VALUES($1,31337,'did:ethr:0x7a69:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',now(),now()+interval '15 minutes') RETURNING id`,
    [alice],
  )
).rows[0].id;
await db.query(
  `INSERT INTO credentials(holder_did,issuer_did,sd_jwt_payload,identity_link_id,expires_at,encrypted_payload,encryption_key_ref)
 VALUES('did:ethr:0x7a69:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','did:web:demo.invalid','legacy-quarantined',$1,now()+interval '1 day',decode('012345','hex'),'test-key-reference')`,
  [link],
);
async function as(role, subject = "") {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
    subject,
  ]);
  await db.exec(`SET ROLE ${role}`);
}
let count = 0;
await as("authenticated", alice);
assert.equal((await db.query("SELECT id FROM credentials")).rows.length, 1);
count++;
await assert.rejects(() => db.query("SELECT sd_jwt_payload FROM credentials"));
count++;
await assert.rejects(() =>
  db.query("SELECT encrypted_payload FROM credentials"),
);
count++;
await assert.rejects(() =>
  db.query(
    "UPDATE auth_identity_links SET controller='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'",
  ),
);
count++;
await assert.rejects(() =>
  db.query(
    `INSERT INTO auth_identity_links(user_id,chain_id,did,controller,proof_time,expires_at) VALUES($1,1,'forged','0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',now(),now())`,
    [alice],
  ),
);
count++;
await as("authenticated", bob);
assert.equal((await db.query("SELECT id FROM credentials")).rows.length, 0);
count++;
await as("authenticated", auditor);
assert.equal((await db.query("SELECT id FROM credentials")).rows.length, 0);
count++;
await as("anon");
await assert.rejects(() => db.query("SELECT id FROM credentials"));
count++;
await as("service_role");
assert.equal((await db.query("SELECT id FROM credentials")).rows.length, 1);
count++;
await db.query("UPDATE auth_identity_links SET revoked=true WHERE id=$1", [
  link,
]);
await as("authenticated", alice);
assert.equal((await db.query("SELECT id FROM credentials")).rows.length, 0);
count++;
await as("service_role");
await db.query(
  "UPDATE auth_identity_links SET revoked=false,expires_at=now()-interval '1 second' WHERE id=$1",
  [link],
);
await as("authenticated", alice);
assert.equal((await db.query("SELECT id FROM credentials")).rows.length, 0);
count++;
await as("service_role");
await db.query(
  "UPDATE auth_identity_links SET expires_at=now()+interval '1 day' WHERE id=$1",
  [link],
);
await db.exec("UPDATE credentials SET is_revoked=true");
await as("authenticated", alice);
assert.equal((await db.query("SELECT id FROM credentials")).rows.length, 0);
count++;
await as("service_role");
await db.exec(
  "UPDATE credentials SET is_revoked=false,expires_at=now()-interval '1 second'",
);
await as("authenticated", alice);
assert.equal((await db.query("SELECT id FROM credentials")).rows.length, 0);
count++;
await db.close();
console.log(
  `PASS: ${count} PostgreSQL RLS checks (owner, other user, anonymous, auditor, service, forgery, ciphertext, revocation, expiry).`,
);
