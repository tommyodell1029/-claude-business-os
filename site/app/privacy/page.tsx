import type { Metadata } from "next";
import { loadOfferings } from "../../lib/offerings.ts";

export const metadata: Metadata = { title: "Privacy policy" };
const email = loadOfferings().terms.cancellation_email;

export default function Privacy() {
  return (
    <article className="wrap narrow prose">
      <h1>Privacy policy</h1>

      <h2>Contact form</h2>
      <p>
        When you use the form on this site we collect your name, email address and/or phone number, business name and message, which
        you choose to give us. We also record that you agreed to be contacted, the wording you agreed to, your browser&apos;s user-agent text,
        and a one-way hash of your IP address (we do not store the IP address itself). We use this to reply to you and to limit spam.
        We do not sell your information.
      </p>

      <h2>Phone calls and recordings</h2>
      <p>
        LaunchPad Local provides AI phone receptionists to businesses. When you call a business that uses our service, an AI assistant
        answers. It says at the start of the call that it is an AI assistant and that the call may be recorded. Florida law requires
        every party to a call to consent to recording, so if you do not want to be recorded, please hang up when you hear that message.
      </p>
      <p>
        If you continue, we may record the call and keep a transcript, the caller&apos;s phone number, and the details you give (such as
        your name and what you need). We pass a summary to the business you called so they can follow up. Recordings and transcripts belong
        to that business&apos;s account with us.
      </p>

      <h2>Who processes data</h2>
      <p>
        We use service providers to run the service, such as telephony, speech recognition and synthesis, an AI language model, a
        database, and email and text delivery. They process data only to provide those services to us.
      </p>

      <h2>Your choices</h2>
      <p>To ask us to see or delete information we hold about you, email <a href={`mailto:${email}`}>{email}</a>.</p>
    </article>
  );
}
