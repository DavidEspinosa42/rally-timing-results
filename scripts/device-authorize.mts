// Authorizes a device key for one point on one stage or control. Run it once
// per point; a device can hold several. Needs db:server running.
import { parseArgs } from "node:util";
// @next/env is bundled CommonJS: Node cannot see its named exports.
import nextEnv from "@next/env";
import { POINTS, type Point } from "@/lib/record/types";
import { closeDb, getDb } from "@/lib/server/db/client";
import {
  authorizeDevice,
  formatTarget,
  parseTarget,
} from "@/lib/server/devices";

const USAGE = `Usage: pnpm device:authorize <public-key> <target> <point> [--rally <id>]

  <public-key>  the device's raw Ed25519 public key, 64 hex characters
  <target>      SS<number> for a special stage (SS0 is the shakedown),
                or TC<code> for a time control, for example TC4A
  <point>       START, FINISH, SPLIT or STOP on a stage; TC on a control
  --rally <id>  needed only when there is more than one rally`;

const isPoint = (text: string): text is Point =>
  (POINTS as readonly string[]).includes(text);

function exit(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

nextEnv.loadEnvConfig(process.cwd());

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { rally: { type: "string" } },
});
const [publicKey, targetText, pointText, ...extra] = positionals;
if (
  publicKey === undefined ||
  targetText === undefined ||
  pointText === undefined ||
  extra.length > 0
) {
  exit("Expected exactly three arguments.");
}
const target = parseTarget(targetText);
if (target === null) exit(`Not a target: ${targetText}`);
const point = pointText.toUpperCase();
if (!isPoint(point)) {
  exit(`Not a point: ${pointText}`);
}

try {
  const result = await authorizeDevice(getDb(), {
    publicKey,
    target,
    point,
    rallyId: values.rally ?? null,
  });
  if (!result.ok) exit(result.error);
  const grant = `${formatTarget(target)} ${point}`;
  console.log(
    result.grantAdded
      ? `Device ${result.keyId} may now enter ${grant} (rally ${result.rallyId}).`
      : `Device ${result.keyId} already holds ${grant}; nothing changed.`,
  );
} finally {
  await closeDb();
}
