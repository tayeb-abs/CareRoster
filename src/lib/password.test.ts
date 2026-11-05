import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password";

test("stores passwords as salted hashes and verifies the seeded test credentials", async () => {
  for (const password of ["admin", "headnurse", "Admin123!", "Head123!"]) {
    const stored = await hashPassword(password);
    assert.notEqual(stored, password);
    assert.match(stored, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    assert.equal(await verifyPassword(password, stored), true);
    assert.equal(await verifyPassword(`${password}-wrong`, stored), false);
  }
});
