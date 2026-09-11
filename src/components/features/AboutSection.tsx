import { Container } from "@/components/ui/Container";

export function AboutSection() {
  return (
    <section aria-labelledby="about-heading" className="py-20">
      <Container className="mx-auto max-w-3xl">
        <h2
          id="about-heading"
          className="text-3xl font-bold text-slate-900 dark:text-white"
        >
          About E Sakhi
        </h2>
        <div className="mt-6 space-y-4 text-slate-600 dark:text-slate-300">
          <p>
            Nepal&apos;s EV charging network is growing quickly, but
            information about it is scattered — spreadsheets, word of mouth,
            and listings that go out of date. E Sakhi is built to be a
            single, reliable place to find a station, check whether it
            actually fits your vehicle, and estimate how long charging will
            take.
          </p>
          <p>
            The platform starts from a real but imperfect dataset. Some
            station details are confirmed; others are estimated or still
            need verification. Instead of hiding that, E Sakhi shows each
            station&apos;s verification status directly, and improves over
            time as station data gets checked and as drivers report
            corrections.
          </p>
        </div>
      </Container>
    </section>
  );
}
