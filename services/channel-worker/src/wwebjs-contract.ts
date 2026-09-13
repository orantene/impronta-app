import type { Chat, Client, Contact, Message } from "whatsapp-web.js";

import type { BackfillChat, BackfillClient } from "./backfill.js";
import type { RelayContact, RelayMessage } from "./relay.js";

/**
 * The worker reads whatsapp-web.js through narrow structural types of its own,
 * so the modules stay unit-testable against plain objects. The cost is that a
 * hand-written type can drift from — or simply invent — the library it claims
 * to describe, and nothing notices: tsx strips types without checking them,
 * and a fixture written from the same wrong assumption agrees with it.
 *
 * That is not hypothetical. `RelayMessage` carried `notifyName` for the
 * sender's name; no such property exists on `Message` in this library, so
 * every live inbound message reached the app unnamed and every new customer
 * would have been filed under their phone number forever. The fixture tests
 * passed throughout, because the fixture supplied the invented field.
 *
 * Nothing imports this module. It exists to be compiled.
 */

/**
 * Properties the worker's type claims and the library's does not have.
 *
 * The assignability checks below cannot find these on their own: an optional
 * property the source lacks is still structurally assignable, which is
 * precisely the hole `notifyName` went through. This closes it by comparing
 * key sets directly, and puts the offending name in the error message.
 */
type Invented<T, Source> = Exclude<keyof T, keyof Source>;

type NoInventedKeys<T, Source> = [Invented<T, Source>] extends [never]
  ? true
  : { readonly error: "property absent from the whatsapp-web.js type"; readonly keys: Invented<T, Source> };

/** Every property read off a Message/Chat/Contact must exist on the real one. */
const _relayMessageKeys: NoInventedKeys<RelayMessage, Message> = true;
const _relayContactKeys: NoInventedKeys<RelayContact, Contact> = true;
const _backfillChatKeys: NoInventedKeys<BackfillChat, Chat> = true;
const _backfillClientKeys: NoInventedKeys<BackfillClient, Client> = true;

/** And a real library value must stand in for the type we read it through,
 * which is what catches a renamed property or a signature changed upstream. */
const _messageSatisfiesRelay: (message: Message) => RelayMessage = (message) => message;
const _contactSatisfiesRelay: (contact: Contact) => RelayContact = (contact) => contact;
const _chatSatisfiesBackfill: (chat: Chat) => BackfillChat = (chat) => chat;
const _clientSatisfiesBackfill: (client: Client) => BackfillClient = (client) => client;

void _relayMessageKeys;
void _relayContactKeys;
void _backfillChatKeys;
void _backfillClientKeys;
void _messageSatisfiesRelay;
void _contactSatisfiesRelay;
void _chatSatisfiesBackfill;
void _clientSatisfiesBackfill;
