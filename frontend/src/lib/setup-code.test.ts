import assert from "node:assert/strict";
import { test } from "node:test";

import { CODE_COMMAND, CODE_HELP } from "./setup-code.ts";

test("setup code help names the command and the install folder", () => {
  assert.equal(CODE_COMMAND, "docker compose logs atlas-api | grep 'setup code'");
  assert.match(CODE_HELP.intro, /install folder/);
  assert.match(CODE_HELP.folder, /docker-compose\.yml/);
  assert.match(CODE_HELP.folder, /installer/);
  assert.match(CODE_HELP.folder, /cloned/);
});
