"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { usernameSchema, displayNameSchema } from "@/lib/schemas/profile";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  username: usernameSchema,
  display_name: displayNameSchema,
});

type FormValues = z.infer<typeof schema>;

function canChangeUsername(usernameChangedAt: string | null): boolean {
  if (!usernameChangedAt) return true;
  const changed = new Date(usernameChangedAt);
  const cooldownEnd = new Date(changed.getTime() + 30 * 24 * 60 * 60 * 1000);
  return new Date() >= cooldownEnd;
}

function cooldownEndDate(usernameChangedAt: string): string {
  const changed = new Date(usernameChangedAt);
  const cooldownEnd = new Date(changed.getTime() + 30 * 24 * 60 * 60 * 1000);
  return cooldownEnd.toLocaleDateString();
}

export function ProfileEditDialog({
  userId,
  currentUsername,
  currentDisplayName,
  usernameChangedAt,
}: {
  userId: string;
  currentUsername: string;
  currentDisplayName: string;
  usernameChangedAt: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const usernameEditable = canChangeUsername(usernameChangedAt);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: currentUsername,
      display_name: currentDisplayName,
    },
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
      if (dbError.code === "23505") {
        setServerError("Username is taken.");
      } else if (dbError.message.includes("username_cooldown")) {
        setServerError(
          usernameChangedAt
            ? `You can change your username again on ${cooldownEndDate(usernameChangedAt)}.`
            : "Username can only be changed once every 30 days."
        );
      } else {
        setServerError(dbError.message);
      }
      return;
    }

    setOpen(false);

    if (values.username !== currentUsername) {
      router.replace(`/u/${values.username}`);
    } else {
      router.refresh();
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit profile
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="yourhandle"
                      disabled={!usernameEditable}
                      {...field}
                    />
                  </FormControl>
                  {!usernameEditable && usernameChangedAt && (
                    <p className="text-xs text-muted-foreground">
                      Available to change on {cooldownEndDate(usernameChangedAt)}.
                    </p>
                  )}
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
              {form.formState.isSubmitting ? "Saving…" : "Save"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    </>
  );
}
