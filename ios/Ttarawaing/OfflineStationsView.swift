import CoreLocation
import SwiftUI

struct OfflineStationsView: View {
    @StateObject private var location = StationLocation()
    @State private var query = ""
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    private var results: [StationResult] {
        let words = query.split(whereSeparator: \.isWhitespace)
        guard !words.isEmpty || location.current != nil else { return [] }

        let matches = StationCatalog.bundled.stations.filter { station in
            let text = "\(station.name) \(station.address)"
            return words.allSatisfy { text.localizedStandardContains($0) }
        }

        if let current = location.current {
            return matches.map { station in
                StationResult(station: station, distance: current.distance(from: station.location))
            }
            .sorted { $0.distance ?? .infinity < $1.distance ?? .infinity }
            .prefix(words.isEmpty ? 5 : 50)
            .map { $0 }
        }

        return matches.prefix(50).map { StationResult(station: $0, distance: nil) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        if location.needsSettings {
                            openURL(URL(string: UIApplication.openSettingsURLString)!)
                        } else {
                            location.request()
                        }
                    } label: {
                        HStack {
                            Label(location.needsSettings ? "설정에서 위치 권한 확인" : "내 주변 대여소 찾기", systemImage: "location")
                            Spacer()
                            if location.isLocating { ProgressView() }
                        }
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .disabled(location.isLocating)

                    if let message = location.message {
                        Text(message).font(.subheadline).foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("인터넷 없이 대여소 위치를 찾을 수 있어요. 실시간 자전거 수량은 경로 화면에서 확인해 주세요.")
                }

                Section {
                    TextField("대여소 이름 또는 주소", text: $query)
                        .accessibilityLabel("대여소 이름 또는 주소")
                        .submitLabel(.search)
                        .autocorrectionDisabled()
                        .frame(minHeight: 44)

                    if results.isEmpty {
                        Text(emptyMessage)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(results) { result in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(result.station.name).font(.headline)
                                Text(result.station.address).font(.subheadline)
                                    .foregroundStyle(.secondary)
                                if let distance = result.distance {
                                    Text("직선거리 \(Measurement(value: distance, unit: UnitLength.meters).formatted(.measurement(width: .abbreviated, usage: .road)))")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 4)
                            .accessibilityElement(children: .combine)
                        }
                    }
                } header: {
                    Text("대여소 검색")
                } footer: {
                    if !StationCatalog.bundled.stations.isEmpty {
                        Text("출처 \(StationCatalog.bundled.source.name) · \(StationCatalog.bundled.source.asOf)")
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("오프라인 대여소")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("닫기") { dismiss() }
                }
            }
        }
    }

    private var emptyMessage: String {
        if StationCatalog.bundled.stations.isEmpty {
            return "대여소 목록을 불러오지 못했어요."
        }
        if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && location.current == nil {
            return "대여소 이름이나 주소로 검색하거나, 내 주변의 대여소를 찾아보세요."
        }
        return "검색어와 일치하는 대여소가 없어요."
    }
}

private struct StationResult: Identifiable {
    let station: Station
    let distance: CLLocationDistance?
    var id: String { station.id }
}

private struct Station: Decodable {
    let id: String
    let name: String
    let address: String
    let latitude: Double
    let longitude: Double

    var location: CLLocation { CLLocation(latitude: latitude, longitude: longitude) }
}

private struct StationCatalog: Decodable {
    struct Source: Decodable {
        let name: String
        let asOf: String
    }

    let source: Source
    let stations: [Station]

    static let bundled: StationCatalog = {
        if let url = Bundle.main.url(forResource: "seoul-bike-stations", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let catalog = try? JSONDecoder().decode(StationCatalog.self, from: data) {
            return catalog
        }
        return StationCatalog(source: Source(name: "", asOf: ""), stations: [])
    }()
}

@MainActor
private final class StationLocation: NSObject, ObservableObject, @preconcurrency CLLocationManagerDelegate {
    @Published private(set) var current: CLLocation?
    @Published private(set) var isLocating = false
    @Published private(set) var needsSettings = false
    @Published private(set) var message: String?
    private let manager = CLLocationManager()
    private var isRequestingLocation = false

    override init() {
        super.init()
        // CLLocationManager는 메인 액터에서 만들고 delegate 콜백도 같은 런 루프에서 받아요.
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    func request() {
        message = nil
        current = nil
        isLocating = true
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else {
            locationManagerDidChangeAuthorization(manager)
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        needsSettings = status == .denied || status == .restricted
        if needsSettings {
            current = nil
            isLocating = false
            message = "위치 권한이 꺼져 있어요. 대여소 이름이나 주소로도 검색할 수 있어요."
        } else if isLocating && !isRequestingLocation &&
                  (status == .authorizedWhenInUse || status == .authorizedAlways) {
            isRequestingLocation = true
            manager.requestLocation()
        } else {
            message = nil
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard isRequestingLocation else { return }
        isRequestingLocation = false
        isLocating = false
        current = locations.last
        if current == nil { message = "현재 위치를 가져오지 못했어요. 잠시 후 다시 시도해 주세요." }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard isRequestingLocation else { return }
        isRequestingLocation = false
        isLocating = false
        message = "현재 위치를 가져오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
}
