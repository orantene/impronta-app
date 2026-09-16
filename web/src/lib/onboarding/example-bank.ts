/**
 * Example sentences shown on the entry screen, one at a time, rotating every
 * two seconds while the person has not started typing or talking.
 *
 * They exist to show HOW to answer (one sentence, in your own words, what you
 * do and where) across the kinds of people Tulala serves, so nobody stares at
 * an empty box. Static, per locale, no AI. Kept in parallel so a Spanish
 * reader never sees an English example.
 */

export const EXAMPLE_ROTATE_MS = 2000;

export const EXAMPLE_SENTENCES: Readonly<Record<"en" | "es", readonly string[]>> = {
  en: [
    "I clean houses in Playa del Carmen, Monday to Saturday.",
    "I have a nail salon in Tulum called Uñas Mariana, and I also do nails at home.",
    "We're a taquería in Cancún, open every night, we deliver on WhatsApp.",
    "I'm a wedding photographer based in Mérida, I travel all over Yucatán.",
    "I teach yoga on the beach in Puerto Morelos, mornings and sunsets.",
    "Barber shop in Playa, walk-ins welcome, cuts and beard from 150 pesos.",
    "I'm a DJ for weddings and private parties, Riviera Maya and Cancún.",
    "We run a small Indian restaurant in Tulum, tandoor and thali, lunch and dinner.",
    "I do massages at hotels and villas, Swedish and deep tissue, I come to you.",
    "Personal trainer in Cancún, small groups and one-on-one, mornings.",
    "I make custom cakes in Mérida, weddings and birthdays, order three days ahead.",
    "Private boat tours from Isla Mujeres, snorkelling and sunset, up to eight people.",
  ],
  es: [
    "Limpio casas en Playa del Carmen, de lunes a sábado.",
    "Tengo un salón de uñas en Tulum que se llama Uñas Mariana, y también voy a domicilio.",
    "Somos una taquería en Cancún, abrimos todas las noches, entregamos por WhatsApp.",
    "Soy fotógrafa de bodas en Mérida, viajo por todo Yucatán.",
    "Doy clases de yoga en la playa en Puerto Morelos, mañanas y atardeceres.",
    "Barbería en Playa, sin cita, corte y barba desde 150 pesos.",
    "Soy DJ para bodas y fiestas privadas, Riviera Maya y Cancún.",
    "Tenemos un restaurante indio pequeño en Tulum, tandoor y thali, comida y cena.",
    "Doy masajes en hoteles y villas, sueco y tejido profundo, voy a donde estés.",
    "Entrenador personal en Cancún, grupos pequeños y uno a uno, por las mañanas.",
    "Hago pasteles personalizados en Mérida, bodas y cumpleaños, pide con tres días.",
    "Tours en lancha privada desde Isla Mujeres, snorkel y atardecer, hasta ocho personas.",
  ],
};

export function exampleAt(locale: "en" | "es", index: number): string {
  const list = EXAMPLE_SENTENCES[locale];
  return list[((index % list.length) + list.length) % list.length];
}
