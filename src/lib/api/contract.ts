import { z } from "zod";
import { CONTROL_KINDS, POINTS } from "@/lib/record/types";

// Response bodies of the read endpoints. The server builds them; the client
// parses every response with these schemas before trusting it.

export const rallySummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
});
export type RallySummary = z.infer<typeof rallySummarySchema>;

/** GET /api/rallies */
export const ralliesResponseSchema = z.array(rallySummarySchema);

const stageTargetSchema = z.strictObject({
  kind: z.literal("stage"),
  stageId: z.uuid(),
  number: z.int().min(0),
  name: z.string(),
  // False for a shakedown.
  scoring: z.boolean(),
  isPowerStage: z.boolean(),
});

const controlTargetSchema = z.strictObject({
  kind: z.literal("control"),
  controlId: z.uuid(),
  code: z.string(),
  controlKind: z.enum(CONTROL_KINDS),
});

/** One point the device may enter on one stage or control. */
export const grantSchema = z.strictObject({
  sectionId: z.uuid(),
  point: z.enum(POINTS),
  target: z.discriminatedUnion("kind", [
    stageTargetSchema,
    controlTargetSchema,
  ]),
});
export type Grant = z.infer<typeof grantSchema>;

/** GET /api/devices/[keyId], once the device is authorized. */
export const deviceInfoSchema = z.strictObject({
  keyId: z.string().regex(/^[0-9a-f]{64}$/),
  rallyId: z.uuid(),
  revoked: z.boolean(),
  // In itinerary order.
  grants: z.array(grantSchema),
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;
