/**
 * El script de la landing.
 *
 * Va en línea y sin hidratar: la landing es un Server Component y no necesita
 * React para esto. Hace dos cosas:
 *
 * - revela cada bloque cuando **entra en la ventana** (el movimiento ocurre
 *   donde está mirando la persona, no cuando carga la página);
 * - detiene la flotación de la carta cuando el bloque no está a la vista o la
 *   pestaña está en segundo plano.
 *
 * Sin JavaScript el contenido se ve igual: la mejora es progresiva.
 */
export function LandingMotion() {
  return (
    <script
      // biome-ignore lint: el script es propio y tiene que ser pequeño.
      dangerouslySetInnerHTML={{
        __html: `(function () {
  var reveal = document.querySelectorAll(".landing-reveal");
  var float = document.querySelector(".landing-float");
  var hasObserver = "IntersectionObserver" in window;

  if (!reveal.length) {
    return;
  }

  if (hasObserver) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    reveal.forEach(function (element) {
      observer.observe(element);
    });
  } else {
    reveal.forEach(function (element) {
      element.classList.add("is-visible");
    });
  }

  if (!float) {
    return;
  }

  var inView = true;
  var update = function () {
    float.classList.toggle("is-paused", !inView || document.hidden);
  };

  if (hasObserver) {
    var floatObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        inView = entry.isIntersecting;
      });
      update();
    });
    floatObserver.observe(float);
  }

  document.addEventListener("visibilitychange", update);
  update();
})();`,
      }}
    />
  );
}
