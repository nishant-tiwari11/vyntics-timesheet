import { z } from "zod";
import { ROLES, SIGN_IN_METHODS } from "./config";

// What the admin's access form and actions accept. Shared by the server (which checks every request again) and the form.

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);
export const passwordSchema = z.string().min(10, "The password must be at least 10 characters.").max(72, "The password can be at most 72 characters.");
export const expirySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid expiry date.")
  .nullable()
  .optional();

export const addUserSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().max(100).default(""),
    role: z.enum(ROLES),
    method: z.enum(SIGN_IN_METHODS),
    password: z.string().max(72).optional(),
    expiresOn: expirySchema,
  })
  .superRefine((v, ctx) => {
    if (v.method === "password") {
      const ok = passwordSchema.safeParse(v.password ?? "");
      if (!ok.success) ctx.addIssue({ code: "custom", path: ["password"], message: ok.error.issues[0].message });
    }
  });
export type AddUserInput = z.input<typeof addUserSchema>;

export const updateUserSchema = z.object({
  email: emailSchema,
  role: z.enum(ROLES).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  expiresOn: expirySchema,
  clearExpiry: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({ email: emailSchema, password: passwordSchema });

export const bulkSchema = z.object({
  people: z.array(z.object({ email: emailSchema, name: z.string().trim().max(100).default(""), role: z.enum(ROLES) })).min(1, "Add at least one person.").max(200),
  method: z.enum(SIGN_IN_METHODS).default("google"),
  expiresOn: expirySchema,
});

/** The first problem in a failed check, in words an admin can act on. */
export const firstIssue = (e: z.ZodError): string => e.issues[0]?.message ?? "Please check the form and try again.";
