import SwiftUI

@main
struct TtarawaingApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .tint(Color.accentColor)
        }
    }
}

private struct ContentView: View {
    private enum Tab: Hashable { case route, stations, info }
    @State private var tab: Tab = .route

    var body: some View {
        TabView(selection: $tab) {
            RouteView { tab = .stations }
                .tabItem { Label("경로 찾기", systemImage: "map") }
                .tag(Tab.route)
            OfflineStationsView()
                .tabItem { Label("대여소", systemImage: "bicycle") }
                .tag(Tab.stations)
            NavigationStack {
                List {
                    Section {
                        Link("서비스 소개", destination: RouteBrowser.origin.appending(path: "about"))
                        Link("개인정보 처리방침", destination: RouteBrowser.origin.appending(path: "privacy"))
                        Link("문의 및 오류 제보", destination: URL(string: "https://github.com/bigcloud07/ttarawaing/issues")!)
                    } footer: {
                        Text("따라와잉은 서울시·따릉이와 별도로 운영되는 독립 프로젝트예요. 자전거 대여와 반납은 공식 따릉이 앱에서 할 수 있어요.")
                    }
                }
                .navigationTitle("앱 정보")
            }
            .tabItem { Label("앱 정보", systemImage: "info.circle") }
            .tag(Tab.info)
        }
    }
}
