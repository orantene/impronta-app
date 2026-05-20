import { type Msg } from "./client-conversations-1";



export const MOCK_THREAD: Record<string, Msg[]> = {
  c1: [
    { id: "c1m1", kind: "system", body: "Inquiry created · routed to Acme Models", ts: "Apr 28 · 10:14" },
    { id: "c1m1a", kind: "text", sender: "workspace", body: "Acme Models received the brief. Sara's pulling editorial talent + will be back to you within the day.", ts: "Apr 28 · 10:14", readBy: ["you"] },
    { id: "c1m2", kind: "text", sender: "coordinator", body: "Hi Marta — Mango is briefing for a Spring lookbook in Madrid. Single day, May 14. Editorial energy, less commercial. Are you open?", ts: "Apr 28 · 10:18", readBy: ["you"] },
    { id: "c1m3", kind: "image", sender: "coordinator", caption: "Mood board — what they sent us.", count: 4, ts: "Apr 28 · 10:19" },
    { id: "c1m4", kind: "text", sender: "you", body: "Yes, I'm open on May 14. Looks beautiful — happy to do this.", ts: "Apr 28 · 11:02", readBy: ["coordinator"] },
    { id: "c1m5", kind: "text", sender: "coordinator", body: "Great. Mango's asking for your rate. Single day, full usage (web + social, 12 months, EU). Lunch + transport included.", ts: "Apr 28 · 14:30", readBy: ["you"] },
    { id: "c1m6", kind: "action-rate", ts: "Apr 28 · 14:31" },
  ],
  c2: [
    { id: "c2m1", kind: "system", body: "Hold opened · May 18–20 · Bvlgari", ts: "Apr 26 · 09:00" },
    { id: "c2m1a", kind: "text", sender: "workspace", body: "Acme Models is holding May 18–20 for you. Bvlgari has a 48h window to confirm — we'll keep you posted on this thread.", ts: "Apr 26 · 09:00", readBy: ["you"] },
    { id: "c2m2", kind: "text", sender: "client", body: "Holding May 18–20 for Marta. Editorial · jewelry close-ups + 1 lifestyle frame. Budget €4–6k for 3 days, depending on usage.", ts: "Apr 26 · 09:02", readBy: ["coordinator", "you"] },
    { id: "c2m3", kind: "calendar-invite", ts: "Apr 26 · 09:03", title: "Bvlgari · Editorial (Hold)", date: "May 18–20" },
    { id: "c2m4", kind: "voice", sender: "coordinator", durationSec: 22, transcript: "Bvlgari are great to work with — long-time client. They'll lock by Friday. I'd quote at the top of their range, you've worked editorial volume before.", ts: "Apr 26 · 09:30" },
    { id: "c2m5", kind: "text", sender: "you", body: "Sounds good. Let's see the call sheet then I'll quote.", ts: "Apr 26 · 11:14", readBy: ["coordinator"] },
    { id: "c2m6", kind: "text", sender: "client", body: "Holding the dates — call sheet by Friday. Scope is jewelry close-ups + 1 lifestyle frame.", ts: "Yesterday · 16:42" },
  ],
  c3: [
    { id: "c3m1", kind: "system", body: "Booking confirmed · May 14–15 · Vogue Italia", ts: "Apr 12 · 14:00" },
    // System User-attributed booking confirmation. Coordinator handoffs
    // shouldn't break the agency's voice — when Acme Models confirms a
    // booking, the message reads as the workspace, not the individual.
    { id: "c3m1a", kind: "text", sender: "workspace", body: "Acme Models confirmed your booking with Vogue Italia. You'll see contract + call sheet land in this thread — we're across both ends.", ts: "Apr 12 · 14:00", readBy: ["you"] },
    { id: "c3m2", kind: "text", sender: "coordinator", body: "Booked! Two days at Studio 5 in Milan. Locked rate, locked usage. You're seeing your take-home only — full offer is between Vogue and us.", ts: "Apr 12 · 14:01", readBy: ["you"] },
    { id: "c3m3", kind: "contract-sign", ts: "Apr 12 · 14:02", filename: "Vogue_Italia_Editorial_May14-15.pdf", resolved: true },
    { id: "c3m4", kind: "text", sender: "you", body: "Signed and sent. Excited for this one.", ts: "Apr 12 · 17:48", readBy: ["coordinator"] },
    { id: "c3m5", kind: "text", sender: "coordinator", body: "Polaroids by Friday so the team can pre-approve the look. Any haircolor/length change since the last shoot?", ts: "Apr 13 · 10:14", readBy: ["you"] },
    { id: "c3m6", kind: "polaroid-request", ts: "Apr 14 · 09:00", resolved: 6 },
    { id: "c3m7", kind: "text", sender: "you", body: "Just sent 6 polaroids. Hair is the same length, slightly cooler tone after the Loewe shoot.", ts: "Apr 14 · 09:02", readBy: ["coordinator"] },
    { id: "c3m8", kind: "text", sender: "coordinator", body: "Perfect. Vogue approved the look — they're cool with the cooler tone, suits the wardrobe better.", ts: "Apr 14 · 14:30", readBy: ["you"] },
    { id: "c3m9", kind: "image", sender: "coordinator", caption: "Wardrobe direction from Francesca (Vogue Creative Director) — 12 looks across 2 days.", count: 8, ts: "Apr 22 · 11:20" },
    { id: "c3m10", kind: "text", sender: "coordinator", body: "Heads-up — Day 2 wraps later than expected. Vogue added a beach scene at golden hour. Wrap pushed to 19:00.", ts: "Apr 28 · 16:45", readBy: ["you"] },
    { id: "c3m11", kind: "text", sender: "you", body: "Got it. I'll move my flight to Friday morning then.", ts: "Apr 28 · 17:05", readBy: ["coordinator"] },
    { id: "c3m12", kind: "calendar-invite", ts: "Apr 30 · 10:00", title: "Vogue Italia · Editorial · Day 1", date: "May 14 · 07:00–19:00", resolved: "yes" },
    { id: "c3m13", kind: "calendar-invite", ts: "Apr 30 · 10:00", title: "Vogue Italia · Editorial · Day 2", date: "May 15 · 08:00–17:00", resolved: "yes" },
    { id: "c3m14", kind: "location", sender: "coordinator", label: "Studio 5 · Via Tortona 27, Milan", ts: "May 1 · 11:00" },
    { id: "c3m15", kind: "text", sender: "coordinator", body: "Travel: Vogue's covering the hotel (Magna Pars, walking distance from Studio 5). Train tickets Madrid→Milan Friday — booked under your name. I'll forward the confirmation.", ts: "May 5 · 09:30", readBy: ["you"] },
    { id: "c3m16", kind: "file", sender: "coordinator", filename: "Train_Madrid_Milan_May13.pdf", sizeKB: 184, ts: "May 5 · 09:31" },
    { id: "c3m17", kind: "file", sender: "coordinator", filename: "Hotel_Magna_Pars_confirmation.pdf", sizeKB: 96, ts: "May 5 · 09:32" },
    { id: "c3m18", kind: "text", sender: "you", body: "Both received. Thanks Ana.", ts: "May 5 · 12:18", readBy: ["coordinator"] },
    { id: "c3m19", kind: "text", sender: "coordinator", body: "Tomorrow's the day. Driver Marco picks you up at 06:00 from the hotel — he has your number. WhatsApp him if anything changes.", ts: "May 13 · 18:40", readBy: ["you"] },
    { id: "c3m20", kind: "file", sender: "coordinator", filename: "Vogue_callsheet_v2.pdf", sizeKB: 412, ts: "5h ago" },
    { id: "c3m21", kind: "text", sender: "coordinator", body: "Final call sheet attached. Hair/makeup at 06:30, on set 07:00. Confirm by EOD?", ts: "5h ago" },
    { id: "c3m22", kind: "action-confirm", label: "Confirm call sheet", ts: "5h ago" },
  ],
  // c4 — Stella McCartney CANCELLED (client cancelled the campaign)
  c4: [
    { id: "c4m1", kind: "system", body: "Hold opened · May 14 · Stella McCartney lookbook · referred by Praline London", ts: "Apr 18 · 10:00" },
    { id: "c4m2", kind: "text", sender: "client", body: "Hi all — holding May 14 in Paris for the SS27 lookbook. Single day. Will lock by next Wednesday.", ts: "Apr 18 · 10:04", readBy: ["coordinator", "you"] },
    { id: "c4m3", kind: "text", sender: "you", body: "Held. Lookbook scope is comfortable for me — happy to confirm once dates lock.", ts: "Apr 18 · 11:30", readBy: ["coordinator"] },
    { id: "c4m4", kind: "text", sender: "coordinator", body: "Stella's team is working through wardrobe + creative direction this week. We'll know by Wednesday.", ts: "Apr 22 · 09:18", readBy: ["you"] },
    { id: "c4m5", kind: "system", body: "Stella McCartney cancelled — campaign moved to Q3. Hold released.", ts: "1d 12h ago" },
    { id: "c4m6", kind: "text", sender: "coordinator", body: "Bad news — Stella's just shifted the SS27 campaign to Q3 (designer change). They asked us to keep you on the shortlist for August. Will re-engage when they have firm dates.", ts: "1d 12h ago" },
    { id: "c4m7", kind: "text", sender: "you", body: "Disappointing but understood. Thanks for the heads-up — let me know in August.", ts: "1d 11h ago", readBy: ["coordinator"] },
  ],

  // c6 — Martina Beach Club INQUIRY (new client via Tulala Hub)
  c6: [
    { id: "c6m1", kind: "system", body: "Inquiry created · via Tulala Hub · Hospitality vertical", ts: "1h ago" },
    { id: "c6m2", kind: "text", sender: "coordinator", body: "Hi Marta — new client just reached out via the Hub: Martina Beach Club & Restaurant in Tulum. They're launching a 'Sunday models' summer pool series. 4 dates over 2 months — this Sunday Jun 8 is the first.", ts: "1h ago" },
    { id: "c6m3", kind: "image", sender: "coordinator", caption: "Reference looks they sent — relaxed swimwear, sunset golden hour.", count: 5, ts: "1h ago" },
    { id: "c6m4", kind: "text", sender: "coordinator", body: "Brief just landed — they want a sunset series. €2,800/day plus hotel. Open?", ts: "1h ago" },
    { id: "c6m5", kind: "action-rate", ts: "1h ago" },
  ],

  // c5 — Loewe WRAPPED (paid in full)
  c5: [
    { id: "c5m1", kind: "system", body: "Booking confirmed · Apr 18 · Loewe", ts: "Apr 8 · 11:00" },
    { id: "c5m1a", kind: "text", sender: "workspace", body: "Acme Models confirmed your Loewe booking. Diego is your contact for the day; we're handling the invoice.", ts: "Apr 8 · 11:00", readBy: ["you"] },
    { id: "c5m2", kind: "text", sender: "coordinator", body: "Loewe Capsule editorial. 2 talent, 1 day, ESTUDIO ROCA. You drove yourself — fuel + tolls reimbursed.", ts: "Apr 8 · 11:02" },
    { id: "c5m3", kind: "text", sender: "you", body: "Set up smoothly. Diego was easy to work with — usual ESTUDIO ROCA setup.", ts: "Apr 18 · 17:00", readBy: ["coordinator"] },
    { id: "c5m4", kind: "system", body: "Wrapped · selects shared", ts: "Apr 18 · 17:30" },
    { id: "c5m5", kind: "image", sender: "coordinator", caption: "Loewe selects — final 4 frames they're using.", count: 4, ts: "Apr 22 · 14:00" },
    { id: "c5m6", kind: "text", sender: "coordinator", body: "Selects approved. Invoice cleared today — payout en route.", ts: "Apr 24 · 10:00", readBy: ["you"] },
    { id: "c5m7", kind: "payment-receipt", ts: "Apr 25 · 09:14", amount: "€3,600", method: "Transfer" },
  ],

  // c7 — Solstice Festival · Marta is COORDINATOR
  // Booking-team thread + a private client thread (Marta sees both).
  // Demonstrates: Marta invited Cleo Vega as co-coordinator; she's
  // organizing 3 fire dancers (including herself).
  "c7:talent": [
    { id: "c7tm1", kind: "system", body: "Crew booked · Cleo Vega added as co-coordinator", ts: "May 28 · 09:00" },
    { id: "c7tm2", kind: "text", sender: "coordinator", body: "Team — Solstice Festival closing performance is locked. Three dancers: me, Tariq, Anouk. Cleo is helping me coordinate. 8-min set, Sat Jun 21, Cala Llonga main stage.", ts: "May 28 · 09:05", readBy: ["you"] },
    { id: "c7tm3", kind: "text", sender: "you", body: "Boat transfer at 18:00 from Marina Botafoch — Iván is driving. Bring your usual kit + a backup costume. Production will provide fuel for the props.", ts: "May 28 · 09:08", readBy: ["coordinator"] },
    { id: "c7tm4", kind: "text", sender: "agency", body: "Tariq here — locked. I'll bring my poi + a backup pair.", ts: "May 28 · 11:42" },
    { id: "c7tm5", kind: "text", sender: "agency", body: "Anouk: confirmed. Choreo finalised — sending the music cue list tonight.", ts: "May 28 · 14:20" },
    { id: "c7tm6", kind: "file", sender: "agency", filename: "Solstice_set_cuelist.pdf", sizeKB: 142, ts: "May 28 · 22:14" },
    { id: "c7tm7", kind: "text", sender: "coordinator", body: "Got the cue list — uploading to Files. Cleo will run through it Friday afternoon at the rehearsal.", ts: "May 29 · 08:00", readBy: ["you"] },
    { id: "c7tm8", kind: "text", sender: "client", body: "Joaquín (stage manager) — need updated bios + portrait shots for the program. By Jun 14 please.", ts: "2h ago" },
    { id: "c7tm9", kind: "text", sender: "coordinator", body: "Sending out a request to the team — please drop your latest bio + a clean portrait into Files this week.", ts: "2h ago", readBy: ["you"] },
  ],
  "c7:client": [
    { id: "c7cm1", kind: "system", body: "Direct booking · via your portfolio site", ts: "May 25 · 11:00" },
    { id: "c7cm2", kind: "text", sender: "client", body: "Marta — Bea here from Solstice. Saw your reel and the fire-dance work. We need a 6–10 min closing performance, Sat Jun 21. Three dancers ideally. Budget €7,500 total.", ts: "May 25 · 11:04" },
    { id: "c7cm3", kind: "text", sender: "you", body: "Hi Bea — happy to put a crew together. €7,500 works for 3 dancers + my coordination. I'll have Tariq Joubert and Anouk Naseri locked in — both have festival closer experience.", ts: "May 25 · 12:30", readBy: ["client"] },
    { id: "c7cm4", kind: "text", sender: "client", body: "Perfect. Send me bios + 30s clips for each so I can clear them with the festival director.", ts: "May 25 · 14:00" },
    { id: "c7cm5", kind: "file", sender: "you", filename: "Solstice_crew_bios.pdf", sizeKB: 1840, ts: "May 26 · 18:20" },
    { id: "c7cm6", kind: "text", sender: "client", body: "Approved — locking the booking. Insurance + rider attached. Need updated bios + portrait shots for the program by Jun 14.", ts: "May 28 · 09:00" },
    { id: "c7cm7", kind: "file", sender: "client", filename: "Solstice_insurance_rider.pdf", sizeKB: 220, ts: "May 28 · 09:01" },
    { id: "c7cm8", kind: "text", sender: "you", body: "Got it. Crew is briefed — bios + portraits coming this week.", ts: "May 28 · 09:30", readBy: ["client"] },
  ],

  // c8 — Adidas spec CANCELLED (client rejected the offer)
  c8: [
    { id: "c8m1", kind: "system", body: "Inquiry created · via Tulala Hub · Featured dancers", ts: "Apr 14 · 09:00" },
    { id: "c8m2", kind: "text", sender: "coordinator", body: "Hi Marta — Adidas Originals Berlin team is putting together a dance reel spec. 1 day shoot, looking for 3–4 dancers, looking at your reel.", ts: "Apr 14 · 09:05", readBy: ["you"] },
    { id: "c8m3", kind: "text", sender: "you", body: "Open. What's the usage?", ts: "Apr 14 · 11:42", readBy: ["coordinator"] },
    { id: "c8m4", kind: "text", sender: "coordinator", body: "Global, 12 months, all digital + paid social. Quoted you at €2,400.", ts: "Apr 14 · 13:00", readBy: ["you"] },
    { id: "c8m5", kind: "text", sender: "client", body: "Riku here. Love the reel. Our budget is tighter than expected — can you do €1,500?", ts: "Apr 16 · 14:30" },
    { id: "c8m6", kind: "text", sender: "coordinator", body: "Marta — they came in low. Counter-offered €1,800, holding the line on global usage.", ts: "Apr 16 · 14:45", readBy: ["you"] },
    { id: "c8m7", kind: "text", sender: "client", body: "€1,800 is over our cap. Best we can do is €1,400 + buyout option down the road.", ts: "Apr 18 · 10:00" },
    { id: "c8m8", kind: "system", body: "Adidas declined the v3 counter — their max was €1,400 + buyout. Closed.", ts: "4d ago" },
    { id: "c8m9", kind: "text", sender: "coordinator", body: "Closing this — €1,400 for global usage doesn't pencil. They went with another agency. Worth keeping Riku on file though, his next project might pay better.", ts: "4d ago", readBy: ["you"] },
  ],

  // c9 — Lyra Skincare EXPIRED (client never responded)
  c9: [
    { id: "c9m1", kind: "system", body: "Inquiry created · cold email · events@lyraskincare.com", ts: "Apr 18 · 16:00" },
    { id: "c9m2", kind: "text", sender: "coordinator", body: "Heads-up — got a cold email for a 4h hostess slot at a Lyra Skincare pop-up launch in BCN. Brand is unverified, small team. They asked for a quote.", ts: "Apr 18 · 16:05", readBy: ["you"] },
    { id: "c9m3", kind: "text", sender: "you", body: "What's their budget? Hostess work isn't my usual lane but I can do 4h for the right number.", ts: "Apr 18 · 17:30", readBy: ["coordinator"] },
    { id: "c9m4", kind: "text", sender: "coordinator", body: "Sent them €600 for 4h with travel. Standard rate. Will let you know if they reply.", ts: "Apr 19 · 09:00", readBy: ["you"] },
    { id: "c9m5", kind: "system", body: "Reminder sent — no client reply in 7 days.", ts: "Apr 26 · 10:00" },
    { id: "c9m6", kind: "system", body: "Inquiry expired — no client response in 14 days. Auto-closed.", ts: "10d ago" },
  ],

  // c10 — Atelier Noir BOOKED · Marta is COORDINATOR · NDA workflow
  // Booking-team thread shows Marta dispatching the NDA to Nadia,
  // collecting signed copies, and uploading them to Files. Client
  // thread shows Marta + Valeria working through the brief.
  "c10:talent": [
    { id: "c10tm1", kind: "system", body: "Crew confirmed · Marta + Nadia · Atelier Noir SS27", ts: "Jun 12 · 10:00" },
    { id: "c10tm2", kind: "text", sender: "coordinator", body: "Hi Nadia — Atelier Noir locked us for Jul 4–5 in Lisbon. €2,800/day · 2 days. Same rate I quoted them.", ts: "Jun 12 · 10:02", readBy: ["you"] },
    { id: "c10tm3", kind: "text", sender: "agency", body: "Locked. Excited — couture pieces are my thing.", ts: "Jun 12 · 10:18" },
    { id: "c10tm4", kind: "text", sender: "client", body: "Valeria here — passing through. Atelier's NDA is stricter this round (couture exclusivity). Both talents must sign before fitting day.", ts: "Jun 14 · 09:00" },
    { id: "c10tm5", kind: "file", sender: "client", filename: "Atelier_Noir_NDA_v2.pdf", sizeKB: 280, ts: "Jun 14 · 09:01" },
    { id: "c10tm6", kind: "text", sender: "coordinator", body: "Nadia — Atelier sent the NDA. Sign and send back when you can. I'll do mine tonight.", ts: "Jun 14 · 11:00", readBy: ["you"] },
    { id: "c10tm7", kind: "file", sender: "you", filename: "Marta_Reyes_NDA_signed.pdf", sizeKB: 290, ts: "Jun 14 · 22:30" },
    { id: "c10tm8", kind: "file", sender: "agency", filename: "Nadia_Kohler_NDA_signed.pdf", sizeKB: 285, ts: "Jun 15 · 14:42" },
    { id: "c10tm9", kind: "text", sender: "coordinator", body: "Both signed. Uploading the bundle to Files and forwarding to Valeria.", ts: "Jun 15 · 15:00", readBy: ["you"] },
    { id: "c10tm10", kind: "text", sender: "you", body: "NDA + model release uploaded — all 2 talents signed. We're set for Lisbon.", ts: "6h ago", readBy: ["agency"] },
  ],
  "c10:client": [
    { id: "c10cm1", kind: "system", body: "Direct booking · returning workspace client", ts: "Jun 8 · 14:00" },
    { id: "c10cm2", kind: "text", sender: "client", body: "Marta — Valeria here. Want to lock you for SS27 again. 2 days, Jul 4–5, Convento da Cartuxa near Lisbon. Couture pieces this time. Need 2 talents, you choose.", ts: "Jun 8 · 14:04" },
    { id: "c10cm3", kind: "text", sender: "you", body: "Hi Valeria — pleasure to be back. €2,800/day per talent works (same as last year, +5%). I'll bring Nadia Köhler. Can confirm by tomorrow.", ts: "Jun 8 · 16:18", readBy: ["client"] },
    { id: "c10cm4", kind: "text", sender: "client", body: "€2,800/day approved. Sending the booking confirmation through Atelier.", ts: "Jun 9 · 10:00" },
    { id: "c10cm5", kind: "contract-sign", ts: "Jun 10 · 11:00", filename: "Atelier_Noir_SS27_Booking.pdf", resolved: true },
    { id: "c10cm6", kind: "text", sender: "client", body: "One more thing — the NDA. Couture exclusivity, both talents must sign before fitting. Sending v2 to your booking-team thread so Nadia can sign too.", ts: "Jun 14 · 09:00" },
    { id: "c10cm7", kind: "text", sender: "you", body: "On it. Will get both signed by end of week.", ts: "Jun 14 · 11:30", readBy: ["client"] },
    { id: "c10cm8", kind: "file", sender: "you", filename: "Atelier_Noir_NDA_signed_bundle.zip", sizeKB: 580, ts: "Jun 15 · 15:30" },
    { id: "c10cm9", kind: "text", sender: "client", body: "Both NDAs received and filed. See you in Lisbon!", ts: "Jun 15 · 16:00" },
  ],

  // ──────────────────────────────────────────────────────────────────
  // c11 — Aesop · BRAND-NEW INQUIRY (never opened by Marta).
  // Just landed via Tulala Hub beauty vertical. The thread shows the
  // initial pitch + brand outreach + Sara's framing. Marta hasn't
  // responded yet — the action-rate CTA is live at the bottom.
  // ──────────────────────────────────────────────────────────────────
  c11: [
    { id: "c11m1", kind: "system", body: "Inquiry created · via Tulala Hub · Beauty vertical", ts: "30m ago" },
    { id: "c11m2", kind: "text", sender: "client", body: "Hi — Eun-jin from Aesop. We're shooting a single-day skincare editorial in Berlin late May. Looking for editorial-trained talent with strong skin presence. Budget €3,200 for the day, full editorial usage.", ts: "28m ago" },
    { id: "c11m3", kind: "image", sender: "client", caption: "Reference visuals — minimalist, clean light, close beauty crops.", count: 4, ts: "27m ago" },
    { id: "c11m4", kind: "text", sender: "coordinator", body: "Hi Marta — Aesop just came in via the Hub. Strong fit for your editorial reel, single day in Berlin (May 26). Their team specifically asked for editorial-trained talent. Open?", ts: "25m ago" },
    { id: "c11m5", kind: "text", sender: "coordinator", body: "Aesop's a verified Hub client (gold tier locally) — I'd quote at the top of your range. They've been good with usage clearance in the past.", ts: "25m ago" },
    { id: "c11m6", kind: "action-rate", ts: "25m ago" },
  ],

  // ──────────────────────────────────────────────────────────────────
  // c12 — Lacoste · BRAND-NEW INQUIRY (never opened by Marta).
  // Direct via Acme's roster page — Joana saw Marta's Mango lookbook
  // and reached out. 2-day Lisbon SS27 sportswear shoot, June.
  // ──────────────────────────────────────────────────────────────────
  c12: [
    { id: "c12m1", kind: "system", body: "Inquiry created · direct via Acme Models roster page", ts: "10m ago" },
    { id: "c12m2", kind: "text", sender: "client", body: "Hi Marta — Joana here from Lacoste. Saw your Mango lookbook last week, would love to put you on our SS27 shortlist. 2 days in Lisbon (Jun 3–4), Belém riverside, sportswear with editorial leaning.", ts: "10m ago" },
    { id: "c12m3", kind: "text", sender: "client", body: "Budget is €2,400/day per talent + travel + hotel. Open to a chat?", ts: "10m ago" },
    { id: "c12m4", kind: "text", sender: "coordinator", body: "Marta — Lacoste came in directly. First inbound from them in 18 months and they came pre-qualified (knew your work). I'd quote at the top of your range — they expect it.", ts: "9m ago" },
    { id: "c12m5", kind: "image", sender: "client", caption: "Brief deck — locations, mood, looks per day.", count: 6, ts: "9m ago" },
    { id: "c12m6", kind: "action-rate", ts: "9m ago" },
  ],

  // ──────────────────────────────────────────────────────────────────
  // CLIENT-SIDE THREADS — Martina Beach Club POV
  // The "client thread" tab in the client shell shows the conversation
  // between the brand contact (Martina González) and the agency
  // coordinator. Talent-group thread stays locked for client.
  // ──────────────────────────────────────────────────────────────────
  m1: [
    { id: "m1m1", kind: "system", body: "Inquiry sent · routed via Tulala Hub · Hospitality vertical", ts: "May 30 · 09:14" },
    { id: "m1m2", kind: "text", sender: "you", body: "Hi — we're launching a 'Sunday models' summer pool series. 4 dates, this Sunday Jun 8 is the first. Looking for one editorial-leaning talent. Budget €2,800/day plus hotel.", ts: "May 30 · 09:14" },
    { id: "m1m3", kind: "text", sender: "coordinator", body: "Hi Martina — Sara from Acme Models. We have Marta Reyes available — strong editorial portfolio, hospitality experience. Sending mood reference + her portfolio link.", ts: "May 30 · 11:42", readBy: ["you"] },
    { id: "m1m4", kind: "text", sender: "coordinator", body: "Sending you Marta's polaroids + 2 alternates today.", ts: "1h ago" },
    { id: "m1m5", kind: "image", sender: "coordinator", caption: "Marta's recent editorial work + 2 alternate options.", count: 6, ts: "1h ago" },
  ],
  m2: [
    { id: "m2m1", kind: "system", body: "Booking confirmed · Jun 13 · cocktail bar reopening", ts: "May 22 · 10:00" },
    { id: "m2m2", kind: "text", sender: "coordinator", body: "Booked Zara + Tomás for Friday Jun 13. Both have served at Tulum hospitality events for us before. Uniform from your wardrobe team.", ts: "May 22 · 10:02", readBy: ["you"] },
    { id: "m2m3", kind: "text", sender: "you", body: "Great. We'll have Vincenzo (bar manager) brief them on the cocktail menu before doors open.", ts: "May 22 · 11:15", readBy: ["coordinator"] },
    { id: "m2m4", kind: "file", sender: "coordinator", filename: "Cocktail_bar_callsheet_jun13.pdf", sizeKB: 224, ts: "6h ago" },
    { id: "m2m5", kind: "text", sender: "coordinator", body: "Call sheet attached. Hosts arrive at 18:30 · uniform from your wardrobe team.", ts: "6h ago" },
  ],
  m3: [
    { id: "m3m1", kind: "system", body: "Direct booking · 3 creators · weekend takeover", ts: "Apr 28 · 14:00" },
    { id: "m3m2", kind: "text", sender: "you", body: "Hi all — confirming Lucia, Diego, Camille for May 10–11 weekend. Open content brief, vibe-driven.", ts: "Apr 28 · 14:02" },
    { id: "m3m3", kind: "text", sender: "coordinator", body: "All 3 confirmed. They'll arrange travel themselves — you cover hotel + meals at the club.", ts: "Apr 28 · 14:10", readBy: ["you"] },
    { id: "m3m4", kind: "system", body: "Weekend wrapped · 47 posts published across 3 creators", ts: "May 12 · 18:00" },
    { id: "m3m5", kind: "payment-receipt", ts: "May 18 · 09:00", amount: "€4,200", method: "Transfer" },
    { id: "m3m6", kind: "text", sender: "coordinator", body: "Final analytics report attached — 2.4M reach, 18% engagement on Camille's grid posts. Strong return.", ts: "May 20 · 11:30" },
  ],
  m4: [
    { id: "m4m1", kind: "system", body: "Direct booking · via Reyes Movement Studio portfolio", ts: "May 28 · 10:00" },
    { id: "m4m2", kind: "text", sender: "you", body: "Hi Marta — saw your Solstice Festival reel. We want a fire-dance act for our summer closing party, Sat Sep 6. Same crew if possible.", ts: "May 28 · 10:04" },
    { id: "m4m3", kind: "text", sender: "coordinator", body: "Hi Martina — same crew (me, Tariq, Anouk) is doable for Sep 6. €7,500 total · 3 dancers · 12-min set. Insurance + rider already cleared with Solstice — we can reuse for you.", ts: "May 28 · 11:30", readBy: ["you"] },
    { id: "m4m4", kind: "text", sender: "coordinator", body: "Holding Sep 6 for you. Need a yes by Friday so we can lock the dancers' calendars.", ts: "1d 2h ago" },
  ],
  m5: [
    { id: "m5m1", kind: "system", body: "Inquiry sent · press launch · Mexico City", ts: "Mar 30 · 09:00" },
    { id: "m5m2", kind: "text", sender: "you", body: "Need 2 hostesses for our Mexico City pop-up press launch on Apr 28.", ts: "Mar 30 · 09:01" },
    { id: "m5m3", kind: "text", sender: "coordinator", body: "Booked Marta + Zara. Single evening, 6h. Confirmation + call sheet incoming.", ts: "Apr 5 · 14:00", readBy: ["you"] },
    { id: "m5m4", kind: "text", sender: "you", body: "Cancelling the launch — venue pulled out. Will reach out for the next one.", ts: "Apr 14 · 16:30", readBy: ["coordinator"] },
    { id: "m5m5", kind: "text", sender: "coordinator", body: "Understood. We'll waive the cancellation fee given the relationship. Hope to hear from you soon.", ts: "Apr 14 · 17:00", readBy: ["you"] },
    { id: "m5m6", kind: "system", body: "Booking cancelled · fee waived", ts: "Apr 14 · 17:01" },
  ],

  // CLIENT-SIDE THREADS — The Gringo POV
  g1: [
    { id: "g1m1", kind: "system", body: "Inquiry sent · via Instagram DM · referral from past hire", ts: "May 24 · 22:14" },
    { id: "g1m2", kind: "text", sender: "you", body: "Hey — need 4 hostesses for my birthday charter on Sat Jul 26. Day-trip yacht out of Marina Botafoch.", ts: "May 24 · 22:14" },
    { id: "g1m3", kind: "text", sender: "coordinator", body: "Hi — Sara from Acme Models. We can pull a crew. To send proposals, we'll need ID verification + a card on file (standard for personal clients on a Basic trust tier). Takes 5 min.", ts: "May 25 · 10:00" },
    { id: "g1m4", kind: "text", sender: "coordinator", body: "Verification pending — once funded the deal moves fast. Confirm card on file?", ts: "4h ago" },
  ],
  g2: [
    { id: "g2m1", kind: "system", body: "Direct booking · 2 hostesses · 3h", ts: "Mar 8 · 14:00" },
    { id: "g2m2", kind: "text", sender: "coordinator", body: "Booked Zara + Anouk for Mar 15 private dinner. Card on file charged · €1,200.", ts: "Mar 8 · 14:02", readBy: ["you"] },
    { id: "g2m3", kind: "system", body: "Wrapped · paid in full", ts: "Mar 15 · 23:00" },
    { id: "g2m4", kind: "payment-receipt", ts: "Mar 20 · 09:00", amount: "€1,200", method: "Card on file" },
  ],

  // ── New martina convs (client POV) ──
  m6: [
    { id: "m6m1", kind: "system", body: "Inquiry submitted · annual print campaign brief", ts: "30m ago" },
    { id: "m6m2", kind: "text", sender: "you", body: "Hi Acme — sending our annual print campaign brief. Food + lifestyle, 2 days at the beach club. Aug 18–19. Looking for one editorial-leaning model + the photographer you used for La Mar.", ts: "30m ago" },
    { id: "m6m3", kind: "text", sender: "coordinator", body: "Hi Martina — Diego here from Acme. Brief received. Strong fit with your past work — proposing a shortlist + a refreshed photographer pairing by EOD. €2,800/day per talent works against your budget.", ts: "25m ago" },
    { id: "m6m4", kind: "image", sender: "coordinator", caption: "Initial mood + 3 photographer references.", count: 5, ts: "20m ago" },
  ],
  m7: [
    { id: "m7m1", kind: "system", body: "Inquiry sent · referral via Atelier Roma", ts: "10m ago" },
    { id: "m7m2", kind: "text", sender: "you", body: "Tequila Olmeca activation in Tulum, single evening, Aug 6. Need 3 hostesses · €1,800 total · 4h. Atelier said you'd handle it.", ts: "10m ago" },
    { id: "m7m3", kind: "text", sender: "coordinator", body: "Theo from Praline London — got it. We do a lot of Tulum activations. Sending 5 profiles in the next hour. All have hospitality + brand-rep experience.", ts: "8m ago" },
  ],
  m8: [
    { id: "m8m1", kind: "system", body: "Inquiry created · couple shoot · 4h sunset", ts: "5h ago" },
    { id: "m8m2", kind: "text", sender: "you", body: "Sunset wedding feature for the magazine — 4h shoot, cenote + pool deck, Sat Jul 19. Want Emma if she's available, plus João to shoot.", ts: "5h ago" },
    { id: "m8m3", kind: "text", sender: "coordinator", body: "Emma + João both clear that day. Drafting the full package — talent + photog + half-day retouch. €4,200 total.", ts: "4h ago", readBy: ["you"] },
    { id: "m8m4", kind: "text", sender: "coordinator", body: "Offer ready — €4,200 total. Approve below to lock the date.", ts: "3h ago" },
    { id: "m8m5", kind: "action-confirm", label: "Approve sunset shoot", ts: "3h ago" },
  ],

  // ── New gringo convs ──
  g3: [
    { id: "g3m1", kind: "system", body: "Inquiry sent · Instagram DM · pool party", ts: "30m ago" },
    { id: "g3m2", kind: "text", sender: "you", body: "Pool party at Hotel Eden, Sat Aug 9. Need 6 hostesses · 4h afternoon · €1,800 total. You handled my dinner in March, can we move fast?", ts: "30m ago" },
    { id: "g3m3", kind: "text", sender: "coordinator", body: "Hi — Sara again. Happy to. Quick refresh: your card on file from March is expired. Verify the new card and I'll send 6 profiles immediately.", ts: "25m ago" },
    { id: "g3m4", kind: "text", sender: "coordinator", body: "Standard 50% deposit on confirmation, balance on the day. Same as last time.", ts: "25m ago" },
  ],
  g4: [
    { id: "g4m1", kind: "system", body: "Booking confirmed · sunset boat trip · 3 hostesses", ts: "2d ago" },
    { id: "g4m2", kind: "text", sender: "coordinator", body: "Sunset boat trip Jul 12 confirmed. Zara, Anouk, Lucia — same crew you've worked with. Captain Iván briefed.", ts: "2d ago", readBy: ["you"] },
    { id: "g4m3", kind: "text", sender: "you", body: "Perfect. Let's do another one.", ts: "2d ago", readBy: ["coordinator"] },
    { id: "g4m4", kind: "system", body: "Deposit cleared · €1,200 of €2,400 paid", ts: "2d ago" },
    { id: "g4m5", kind: "text", sender: "coordinator", body: "Booking locked. Deposit cleared. Balance €1,200 due 48h before sail (Jul 10) — same card on file unless you tell me otherwise.", ts: "22h ago" },
  ],
};
