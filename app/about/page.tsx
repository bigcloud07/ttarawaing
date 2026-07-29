import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bike,
  Check,
  Clock3,
  Footprints,
  LocateFixed,
  MapPin,
  MapPinned,
  Navigation,
  RefreshCw,
  Route,
  Smartphone,
} from "lucide-react";
import styles from "./page.module.css";
import ScrollReveal from "./scroll-reveal";

export const metadata: Metadata = {
  title: "따라와잉 소개 — 따릉이 대여부터 반납까지 한 번에",
  description:
    "출발지와 도착지만 고르면 출발 대여소까지 걷는 길부터 따릉이 경로, 반납 대여소와 마지막 도보까지 한 번에 안내해요.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "따라와잉 — 따릉이를 더 편하게",
    description:
      "걷고, 빌리고, 달리고, 반납하는 길을 하나의 경로로 이어드려요.",
    type: "website",
    locale: "ko_KR",
    url: "/about",
    images: [
      {
        url: "/og-v2.png",
        width: 1200,
        height: 630,
        alt: "도보와 따릉이를 이어 목적지까지 안내하는 따라와잉",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "따라와잉 — 따릉이를 더 편하게",
    description:
      "걷고, 빌리고, 달리고, 반납하는 길을 하나의 경로로 이어드려요.",
    images: ["/og-v2.png"],
  },
};

const journeySteps = [
  {
    label: "출발",
    description: "출발지에서 대여소까지 걷는 길",
    tone: "blue",
    icon: Footprints,
  },
  {
    label: "대여",
    description: "수량과 실제 도보 경로를 고려한 대여소",
    tone: "green",
    icon: Bike,
  },
  {
    label: "따릉이",
    description: "카카오맵 자전거 경로를 기반으로 한 이동",
    tone: "green",
    icon: Navigation,
  },
  {
    label: "반납",
    description: "목적지와 이동 경로를 고려한 대여소",
    tone: "green",
    icon: Bike,
  },
  {
    label: "도착",
    description: "반납 후 목적지까지 마지막 도보",
    tone: "coral",
    icon: Footprints,
  },
] as const;

const features = [
  {
    title: "걷기 편한 출발 대여소",
    description:
      "가까운 후보들의 실제 도보 경로를 비교하고, 수량을 확인할 수 있을 때는 자전거가 있는 대여소를 우선 추천해요.",
    note: "조회가 어려우면 ‘수량 미확인’으로 안내해요.",
    icon: MapPinned,
    tone: "blue",
  },
  {
    title: "처음과 마지막 도보까지",
    description:
      "출발 도보, 따릉이, 도착 도보를 색과 아이콘으로 구분해 한 지도에서 보여드려요.",
    note: "각 구간의 거리와 예상 시간도 함께 확인해요.",
    icon: Route,
    tone: "green",
  },
  {
    title: "이용권 시간에 맞춘 경유",
    description:
      "예상 이동시간이 이용권의 안전 시간을 넘으면 중간에 반납하고 다시 빌릴 대여소를 필요한 만큼 찾아드려요.",
    note: "1·2·3시간권을 선택할 수 있어요.",
    icon: RefreshCw,
    tone: "coral",
  },
  {
    title: "경로 확인 후 공식 앱 열기",
    description:
      "추천 출발 대여소를 확인한 뒤 ‘따릉이 대여하기’ 버튼으로 따릉이 공식 앱을 바로 실행해요.",
    note: "QR 인식과 실제 대여는 공식 앱에서 진행해요.",
    icon: Smartphone,
    tone: "green",
  },
] as const;

const stats = [
  {
    value: "8명 중 8명",
    label: "출발지와 도착지를 문제없이 검색했다고 응답",
  },
  {
    value: "4.5 / 5",
    label: "경로 검색 편의성 평균",
  },
  {
    value: "8명 중 6명",
    label: "추천 대여소와 경로가 적합해 보인다고 응답",
  },
  {
    value: "8명 중 6명",
    label: "재사용 의향을 4점 이상으로 평가",
  },
] as const;

const faqs = [
  {
    question: "서울시나 따릉이의 공식 서비스인가요?",
    answer:
      "아니요. 따라와잉은 따릉이 이용 과정의 불편을 줄이기 위해 만든 독립적인 프로젝트예요. 실제 대여와 결제는 따릉이 공식 앱에서 진행해요.",
  },
  {
    question: "자전거 수량은 정확한가요?",
    answer:
      "서울자전거 실시간 현황을 우선 반영하지만 데이터 갱신이 늦거나 연결에 실패할 수 있어요. 확인할 수 없을 때는 ‘수량 미확인’으로 표시하므로 출발 전 공식 앱에서도 다시 확인해 주세요.",
  },
  {
    question: "추천한 반납 대여소에는 반드시 자리가 있나요?",
    answer:
      "현재 신뢰할 수 있는 빈 거치대 정보가 없어 반납 가능 여부를 보장하지 않아요. 운영 중인 대여소와 목적지까지의 이동 경로를 기준으로 추천해요.",
  },
  {
    question: "자전거도로 우선 경로는 전용도로로만 이루어져 있나요?",
    answer:
      "아니요. 가능한 구간에서 자전거도로를 우선하는 경로이며 모든 구간이 자전거 전용도로인 것은 아니에요. 현장의 교통 환경과 표지판을 우선 확인해 주세요.",
  },
  {
    question: "‘따릉이 대여하기’를 누르면 바로 대여되나요?",
    answer:
      "바로 대여되지는 않아요. 딥링크로 따릉이 공식 앱을 실행하며 QR 인식과 실제 대여는 공식 앱에서 진행해야 해요.",
  },
  {
    question: "어디에서 사용할 수 있나요?",
    answer:
      "장소 검색은 서울·경기권을 지원하지만, 대여소 추천은 서울 따릉이 운영 대여소를 기준으로 해요.",
  },
] as const;

export default function AboutPage() {
  return (
    <main className={styles.page} data-landing-reveal-root>
      <ScrollReveal />
      <a className={styles.skipLink} href="#main-content">
        본문으로 바로가기
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link
            className={styles.brand}
            href="/about"
            aria-label="따라와잉 소개 페이지"
          >
            <span className={styles.brandMark} aria-hidden="true">
              <Bike size={24} strokeWidth={2.4} />
            </span>
            <span className={styles.brandCopy}>
              <strong>따라와잉</strong>
              <small>따릉이로 잇는 서울</small>
            </span>
          </Link>

          <nav className={styles.nav} aria-label="랜딩페이지 주요 메뉴">
            <a href="#how">이용 방법</a>
            <a href="#features">주요 기능</a>
            <a href="#proof">검증 결과</a>
            <a href="#faq">FAQ</a>
          </nav>

          <Link className={styles.headerCta} href="/">
            경로 찾기
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.container}>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>
                  <span aria-hidden="true" />
                  서울 따릉이 이용자를 위한 경로 탐색
                </p>
                <h1 id="hero-title">
                  따릉이로 가는 길,
                  <br />
                  <em>더는 따로 찾지 마세요.</em>
                </h1>
                <p className={styles.heroDescription}>
                  출발지와 도착지만 고르면 출발 대여소까지 걷는 길부터
                  따릉이 경로, 반납 대여소와 마지막 도보까지 한 번에
                  이어드려요.
                </p>

                <div className={styles.heroActions}>
                  <Link className={styles.primaryCta} href="/">
                    내 따릉이 경로 찾아보기
                    <ArrowRight size={19} aria-hidden="true" />
                  </Link>
                  <a className={styles.secondaryCta} href="#how">
                    어떻게 이용하나요?
                  </a>
                </div>

                <ul className={styles.assurances} aria-label="서비스 특징">
                  <li>
                    <Check size={15} aria-hidden="true" />
                    설치 없이 바로 사용
                  </li>
                  <li>
                    <Check size={15} aria-hidden="true" />
                    서울 따릉이 대여소 기반
                  </li>
                </ul>
              </div>

              <div className={styles.heroVisual} aria-label="따라와잉 이동 경로 예시">
                <div className={styles.visualFrame}>
                  <Image
                    className={styles.heroImage}
                    src="/og-v2.png"
                    width={1200}
                    height={630}
                    sizes="(max-width: 900px) 92vw, 560px"
                    priority
                    alt="출발지에서 도보로 대여소에 간 뒤 따릉이를 타고 반납하여 목적지까지 걷는 경로"
                  />
                </div>

                <div className={`${styles.floatingPill} ${styles.walkPill}`}>
                  <Footprints size={16} aria-hidden="true" />
                  도보부터
                </div>
                <div className={`${styles.floatingPill} ${styles.bikePill}`}>
                  <Bike size={16} aria-hidden="true" />
                  따릉이
                </div>
                <div className={`${styles.floatingPill} ${styles.arrivePill}`}>
                  <MapPin size={16} aria-hidden="true" />
                  목적지까지
                </div>

                <div className={styles.routePreview}>
                  <span className={styles.previewIcon} aria-hidden="true">
                    <Navigation size={20} />
                  </span>
                  <span>
                    <small>하나의 이동 경로</small>
                    <strong>도보 · 따릉이 · 도보</strong>
                  </span>
                  <b>한 번에</b>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className={styles.story}
          id="story"
          aria-labelledby="story-title"
        >
          <div className={styles.container}>
            <div className={styles.storyCard} data-reveal="up">
              <div className={styles.storyIcon} aria-hidden="true">
                <LocateFixed size={28} />
              </div>
              <div>
                <p className={styles.sectionLabel}>만들게 된 계기</p>
                <h2 id="story-title">
                  목적지는 하나인데,
                  <br />
                  길 찾기는 하나가 아니었어요.
                </h2>
                <p>
                  주말에 가고 싶은 곳까지 따릉이를 타려 했어요. 지도 앱에서
                  목적지까지 자전거 경로를 찾고, 따릉이 앱에서 출발 대여소를
                  확인한 뒤, 도착하기 전에는 목적지 근처 반납 대여소를 다시
                  검색해야 했어요.
                </p>
                <p>
                  한 번의 이동을 위해 여러 화면에서 길을 다시 찾는 일이
                  당연하지 않다고 생각했어요.
                </p>
                <p className={styles.storyHighlight}>
                  한 번의 따릉이 이동을, 하나의 경로로.
                  <strong>그 생각에서 따라와잉이 시작됐어요.</strong>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.problem} id="problem" aria-labelledby="problem-title">
          <div className={styles.container}>
            <div className={styles.sectionHeading} data-reveal="up">
              <p className={styles.sectionLabel}>해결하고 싶은 불편</p>
              <h2 id="problem-title">
                한 번 타려는데,
                <br />
                몇 번이나 앱을 오가고 있나요?
              </h2>
              <p>
                지도에서 길을 찾고, 따릉이 앱에서 대여소를 확인한 뒤,
                반납할 곳과 마지막 도보를 다시 찾아야 했어요.
              </p>
            </div>

            <div
              className={styles.switchFlow}
              aria-label="기존 따릉이 경로 탐색 과정"
              data-reveal="scale"
            >
              <div className={styles.switchCard}>
                <MapPinned size={23} aria-hidden="true" />
                <span>
                  <small>지도 앱</small>
                  <strong>목적지와 자전거 길</strong>
                </span>
              </div>
              <ArrowRight className={styles.flowArrow} size={20} aria-hidden="true" />
              <div className={styles.switchCard}>
                <Bike size={23} aria-hidden="true" />
                <span>
                  <small>따릉이 앱</small>
                  <strong>대여소와 자전거 수량</strong>
                </span>
              </div>
              <ArrowRight className={styles.flowArrow} size={20} aria-hidden="true" />
              <div className={styles.switchCard}>
                <MapPin size={23} aria-hidden="true" />
                <span>
                  <small>다시 지도 앱</small>
                  <strong>반납 후 마지막 도보</strong>
                </span>
              </div>
            </div>

            <div className={styles.problemGrid}>
              <article data-reveal="up">
                <span>01</span>
                <h3>가까운 곳에 자전거가 없어요</h3>
                <p>
                  도착하고 나서야 0대라는 사실을 알면 다른 대여소를 다시
                  찾아야 해요.
                </p>
              </article>
              <article data-reveal="up" data-reveal-delay="1">
                <span>02</span>
                <h3>반납할 곳을 직접 계산해요</h3>
                <p>
                  목적지와 가까운 반납 대여소와 그곳에서 걷는 길을 따로
                  확인해야 해요.
                </p>
              </article>
              <article data-reveal="up" data-reveal-delay="2">
                <span>03</span>
                <h3>한 이동이 여러 경로로 나뉘어요</h3>
                <p>
                  도보, 자전거, 마지막 도보를 서로 다른 화면에서 직접
                  이어 붙여야 해요.
                </p>
              </article>
            </div>

            <blockquote className={styles.quote} data-reveal="up">
              <span aria-hidden="true">“</span>
              <p>
                어디서 반납하고 목적지로 가야 하는지 직접 계산해야 했던 것이
                불편했어요.
              </p>
              <footer>초기 MVP 설문 응답</footer>
            </blockquote>
          </div>
        </section>

        <section className={styles.how} id="how" aria-labelledby="how-title">
          <div className={styles.container}>
            <div
              className={`${styles.sectionHeading} ${styles.lightHeading}`}
              data-reveal="up"
            >
              <p className={styles.sectionLabel}>하나로 이어지는 여정</p>
              <h2 id="how-title">
                출발지와 도착지만 고르면
                <br />
                나머지는 따라와잉이 이어드려요.
              </h2>
              <p>
                걷기와 따릉이가 바뀌는 모든 지점을 한 흐름으로 확인해 보세요.
              </p>
            </div>

            <ol className={styles.journey} data-reveal="route">
              {journeySteps.map((step, index) => {
                const Icon = step.icon;

                return (
                  <li
                    className={styles[`${step.tone}Step`]}
                    data-reveal="up"
                    data-reveal-delay={String(index)}
                    key={step.label}
                  >
                    <div className={styles.stepTop}>
                      <span className={styles.stepNumber}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className={styles.stepIcon} aria-hidden="true">
                        <Icon size={21} />
                      </span>
                    </div>
                    <strong>{step.label}</strong>
                    <p>{step.description}</p>
                  </li>
                );
              })}
            </ol>

            <div className={styles.howCtaRow} data-reveal="up">
              <Link className={styles.lightCta} href="/">
                내 경로로 확인해보기
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.features} id="features" aria-labelledby="features-title">
          <div className={styles.container}>
            <div className={styles.sectionHeading} data-reveal="up">
              <p className={styles.sectionLabel}>주요 기능</p>
              <h2 id="features-title">
                가까움만 보지 않고,
                <br />
                실제 이동을 함께 봐요.
              </h2>
              <p>
                대여소의 거리뿐 아니라 걷는 길, 자전거 수량, 이용권 시간까지
                함께 고려해요.
              </p>
            </div>

            <div className={styles.featureGrid}>
              {features.map((feature, index) => {
                const Icon = feature.icon;

                return (
                  <article
                    className={`${styles.featureCard} ${styles[`${feature.tone}Feature`]}`}
                    data-reveal="up"
                    data-reveal-delay={String(index % 2)}
                    key={feature.title}
                  >
                    <span className={styles.featureIcon} aria-hidden="true">
                      <Icon size={25} />
                    </span>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                    <small>{feature.note}</small>
                  </article>
                );
              })}
            </div>

            <div className={styles.focusBanner} data-reveal="scale">
              <div>
                <p className={styles.sectionLabel}>따릉이에만 집중했어요</p>
                <h3>
                  모든 이동수단보다,
                  <br />
                  따릉이 한 번을 더 단순하게.
                </h3>
              </div>
              <ul>
                <li>
                  <Check size={17} aria-hidden="true" />
                  출발지와 도착지만 입력
                </li>
                <li>
                  <Check size={17} aria-hidden="true" />
                  대여·반납 대여소를 함께 추천
                </li>
                <li>
                  <Check size={17} aria-hidden="true" />
                  경로 확인 후 따릉이 공식 앱 실행
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className={styles.proof} id="proof" aria-labelledby="proof-title">
          <div className={styles.container}>
            <div className={styles.proofHeader} data-reveal="up">
              <div className={styles.sectionHeading}>
                <p className={styles.sectionLabel}>초기 사용 테스트</p>
                <h2 id="proof-title">
                  8명의 첫 사용에서
                  <br />
                  가능성을 확인했어요.
                </h2>
              </div>
              <p>
                공개된 MVP에서 출발지와 도착지를 검색하고 추천 경로를
                확인한 뒤 받은 응답이에요.
              </p>
            </div>

            <div className={styles.statsGrid}>
              {stats.map((stat, index) => (
                <article
                  data-reveal="up"
                  data-reveal-delay={String(index)}
                  key={stat.label}
                >
                  <strong>{stat.value}</strong>
                  <p>{stat.label}</p>
                </article>
              ))}
            </div>

            <div className={styles.proofNote} data-reveal="up">
              <span aria-hidden="true">
                <Clock3 size={20} />
              </span>
              <p>
                이 결과는 8명의 자가보고를 바탕으로 한 초기 테스트예요.
                추천 경로를 따라 실제 대여와 반납까지 완료한 경험과 재방문은
                아직 검증하고 있어요.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.faq} id="faq" aria-labelledby="faq-title">
          <div className={styles.container}>
            <div className={styles.faqGrid}>
              <div className={styles.sectionHeading} data-reveal="up">
                <p className={styles.sectionLabel}>자주 묻는 질문</p>
                <h2 id="faq-title">
                  사용하기 전에
                  <br />
                  확인해 주세요.
                </h2>
              </div>

              <div className={styles.faqList} data-reveal="up" data-reveal-delay="1">
                {faqs.map((faq) => (
                  <details key={faq.question}>
                    <summary>{faq.question}</summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby="final-cta-title">
          <div className={styles.container}>
            <div className={styles.finalCtaCard} data-reveal="scale">
              <span className={styles.finalCtaIcon} aria-hidden="true">
                <Bike size={30} />
              </span>
              <p>다음 따릉이 이동은</p>
              <h2 id="final-cta-title">한 번에 찾아보세요.</h2>
              <span className={styles.finalDescription}>
                출발지와 도착지만 골라보세요. 대여부터 반납, 마지막
                도보까지 따라와잉이 이어드릴게요.
              </span>
              <Link className={styles.finalButton} href="/">
                따라와잉 시작하기
                <ArrowRight size={20} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <span className={styles.footerMark} aria-hidden="true">
              <Bike size={18} />
            </span>
            <span>
              <strong>따라와잉</strong>
              <small>따릉이를 더 편하게</small>
            </span>
          </div>
          <p>
            따라와잉은 서울시·따릉이의 공식 서비스가 아닌 독립
            프로젝트입니다.
          </p>
          <div className={styles.footerLinks}>
            <Link href="/">서비스 열기</Link>
            <a
              href="https://github.com/woowacourse-personal/2026-lumen-ttarawaing"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>

      <div className={styles.mobileCta}>
        <Link href="/">
          내 따릉이 경로 찾아보기
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}
