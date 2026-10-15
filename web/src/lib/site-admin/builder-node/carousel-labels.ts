// TUL-869: carousel control labels follow the page language. Screen readers on
// a Spanish site were reading "Go to slide 1" / "Next slide".

export interface CarouselLabels {
  region: string;
  reviews: string;
  prev: string;
  next: string;
  goTo: (n: number) => string;
}

const EN: CarouselLabels = {
  region: "Highlights",
  reviews: "Reviews",
  prev: "Previous slide",
  next: "Next slide",
  goTo: (n) => `Go to slide ${n}`,
};

const ES: CarouselLabels = {
  region: "Destacados",
  reviews: "Reseñas",
  prev: "Diapositiva anterior",
  next: "Siguiente diapositiva",
  goTo: (n) => `Ir a la diapositiva ${n}`,
};

export function carouselLabels(locale: string | null | undefined): CarouselLabels {
  return (locale ?? "").toLowerCase().startsWith("es") ? ES : EN;
}
