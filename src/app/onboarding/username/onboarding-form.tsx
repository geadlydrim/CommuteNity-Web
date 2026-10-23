"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usernameSchema, displayNameSchema } from "@/lib/schemas/profile";
import { createClient } from "@/lib/supabase/client";
import { riderMessage } from "@/lib/errors";
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
  username: usernameSchema,
  display_name: displayNameSchema,
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

    const { error: dbError } = await supabase
      .from("users")
      .update({ username: values.username, display_name: values.display_name })
      .eq("id", userId);

    if (dbError) {
      setServerError(riderMessage(dbError));
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
