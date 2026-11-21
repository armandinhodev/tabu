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
 *
 * Marca con atributos `data-*` y **no con clases**: el script corre durante el
 * parseo del HTML, antes de que React hidrate. Si tocara una clase que React
 * controla, la hidratación fallaría y React reescribiría el `className` sin
 * ella, dejando el bloque en `opacity: 0` para siempre. Los atributos que
 * React no renderiza no se comparan, así que no hay nada que discrepe.
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
        entry.target.setAttribute("data-reveal", "visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    reveal.forEach(function (element) {
      observer.observe(element);
    });
  } else {
    reveal.forEach(function (element) {
      element.setAttribute("data-reveal", "visible");
    });
  }

  if (!float) {
    return;
  }

  var inView = true;
  var update = function () {
    if (!inView || document.hidden) {
      float.setAttribute("data-float", "paused");
    } else {
      float.removeAttribute("data-float");
    }
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
