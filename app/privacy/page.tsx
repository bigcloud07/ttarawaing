import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "개인정보 처리방침 — 따라와잉",
  description: "따라와잉 웹사이트와 iPhone 앱에서 위치 정보와 이용 데이터를 처리하는 방법이에요.",
};

export default function PrivacyPage() {
  return (
    <main className={styles.policy}>
      <Link href="/about">따라와잉 서비스 소개</Link>
      <h1>개인정보 처리방침</h1>
      <p>이 방침은 따라와잉 웹사이트와 iPhone 앱에 적용돼요.</p>

      <section aria-labelledby="location">
        <h2 id="location">위치와 경로 검색</h2>
        <p>
          현재 위치 기능을 선택하고 권한을 허용하면 주변 대여소를 찾거나 지도에서 내 위치를 표시하는 데
          위치를 사용해요. 온라인으로 경로를 요청하면 선택한 출발지, 도착지, 경유지의 좌표가 따라와잉
          서버를 거쳐 카카오맵 API에 전달돼요. 현재 위치에서 출발하는 경로를 요청하면 현재 위치도
          출발 좌표에 포함돼요. 장소를 검색할 때는 검색어가 카카오맵에 전달돼요.
        </p>
        <p>
          따라와잉은 이 요청의 좌표나 검색어를 자체 데이터베이스에 저장하지 않아요. 최근 경로와
          이용권 설정은 브라우저 또는 앱의 웹 저장소에 남을 수 있어요. iPhone 앱의 오프라인 대여소
          검색에 쓰이는 검색어와 위치는 기기에서 처리해요. 기기 설정에서 위치 권한을 바꿀 수 있어요.
        </p>
      </section>

      <section aria-labelledby="analytics">
        <h2 id="analytics">웹사이트 이용 분석</h2>
        <p>
          웹 브라우저로 접속하면 Vercel Web Analytics와 PostHog로 페이지 방문과 경로 검색 등 기능
          이용 여부를 확인해요. 이 과정에서 기기·브라우저 종류, 유입 경로 및 무작위 브라우저 식별자가
          처리될 수 있어요. 분석 이벤트에는 검색어, 장소명, 주소, GPS 좌표와 실제 경로를 포함하지
          않아요. iPhone 앱에서 따라와잉을 이용할 때는 이 두 분석 도구를 끄고 있어요.
        </p>
      </section>

      <section aria-labelledby="providers">
        <h2 id="providers">외부 서비스</h2>
        <p>
          지도와 경로를 제공하는 <a href="https://www.kakao.com/policy/privacy">카카오</a>,
          웹 서비스와 분석을 제공하는 <a href="https://vercel.com/legal/privacy-policy">Vercel</a>,
          웹 이용 분석을 제공하는 <a href="https://posthog.com/privacy">PostHog</a>는 각자의
          개인정보 처리방침에 따라 정보를 처리해요. 따릉이 대여를 위해 공식 앱을 열면 그 이후의
          정보 처리는 <a href="https://www.bikeseoul.com/">서울자전거 따릉이</a>에서 담당해요.
        </p>
      </section>

      <section aria-labelledby="contact">
        <h2 id="contact">데이터 삭제와 문의</h2>
        <p>
          브라우저에서 따라와잉의 사이트 데이터를 지우거나 iPhone에서 앱을 삭제하면 기기에 저장된
          경로와 설정을 삭제할 수 있어요. 개인정보 관련 문의는{" "}
          <a href="mailto:dnsxo0712@gmail.com">dnsxo0712@gmail.com</a>으로 보내주세요.
        </p>
      </section>
    </main>
  );
}
