// The cooperative's details for the PDF heading (D-110 item 7, step 9.1l).
// Fictional placeholders until the client sends the real ones (D-08, A-270 item 5).

export interface CooperativeDetails {
  name: string;
  address: string;
  registrationNumber: string;
  phone: string;
  email: string;
}

export const COOPERATIVE: Readonly<CooperativeDetails> = Object.freeze({
  name: "Iyanu-Oluwa Cooperative Society",
  address: "1 Placeholder Street, Ikeja, Lagos",
  registrationNumber: "PLACEHOLDER-0000",
  phone: "+234 800 000 0000",
  email: "info@example.com",
});
