"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const schema = z.object({
  username: z
    .string()
    .regex(
      /^[a-z0-9_]{3,20}$/,
      "3–20 lowercase letters, numbers, or underscores"
    )
    .transform((s) => s.toLowerCase()),
  display_name: z
    .string()
    .min(1, "Enter a display name")
    .max(40, "Display name must be 40 characters or less"),
});

type FormValues = z.infer<typeof schema>;

export function OnboardingForm({
  defaultDisplayName,
  userId,
}: {
  defaultDisplayName: string;
  userId: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", display_name: defaultDisplayName },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const supabase = createClient();

    const { error: metaError } = await supabase.auth.updateUser({
      data: { username: values.username, display_name: values.display_name },
    });

    if (metaError) {
      setServerError(metaError.message);
      return;
    }

    const { error: dbError } = await supabase
      .from("users")
      .update({ username: values.username, display_name: values.display_name })
      .eq("id", userId);

    if (dbError) {
      if (
        dbError.code === "23505" ||
        dbError.message.toLowerCase().includes("username")
      ) {
        setServerError("Username is taken.");
      } else {
        setServerError(dbError.message);
      }
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Pick a username</CardTitle>
        <CardDescription>
          Choose a unique handle for your CommuteNity profile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="yourhandle" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="display_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your Name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {serverError && (
              <p className="text-sm text-destructive">{serverError}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving…" : "Continue"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
