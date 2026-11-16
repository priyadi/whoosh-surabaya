"use strict";
// Whoosh to Surabaya Calculator — model, charts and map. No build step; ROUTE comes from route-data.js.

// ---------- constants ----------
const G=9.80665, SEATS=601, WHOOSH_KM=ROUTE.builtKm, ZONE_KM=8, ROT=1.04, CO2_PER_KG_FUEL=3.16, DS=0.2;
const DAVIS=[0.79,0.0064,0.000076];        // N per kN of train weight: a + b·V + c·V², V in km/h
// Steady running at 350 km/h with the default train, traction only: [kWh per km at the overhead line, Wh per seat-km]. Quoted in the texts on the calibration.
const cruise350=()=>{const V=350,k=CTL.mass.def*G*(DAVIS[0]+DAVIS[1]*V+DAVIS[2]*V*V)/CTL.eta.def/3600;return [k,k*1000/SEATS];};
const TRAIN_LIFE_YR=30, AIRCRAFT_CYCLES=40000; // service lives used to spread manufacturing carbon
const TURNAROUND_MIN=30, SERVICE_HOURS=18, N_REF=4; // reference service: Halim – Karawang – Padalarang – Tegalluar
// Routes: the three alternatives of KCIC's pre-feasibility study (the first is the default) and the other combinations of its corridors.
// useRoute() points these at the chosen one; everything below reads them.
const ROUTES=ROUTE.routes, ROUTE_DEF="south";
const SHORT={};ROUTES.forEach(r=>r.stations.forEach(x=>{SHORT[x.id]=x.short;}));
let RT,ST,OPT,ALL,B_KM,I_BDG,MUST_IDX,N_MUST,N_PAT,DEFAULT_STOPS; // B_KM: how much of the built line the route uses
function useRoute(id){
  RT=ROUTES.find(r=>r.id===id)||ROUTES.find(r=>r.id===ROUTE_DEF);
  ST=RT.stations;OPT=ST.filter(s=>!s.must).map(s=>s.id);ALL=OPT.slice();DEFAULT_STOPS=RT.def;B_KM=RT.builtKm;
  I_BDG=ST.findIndex(s=>s.id==="bandung");MUST_IDX=ST.map((s,i)=>s.must?i:-1).filter(i=>i>=0);N_MUST=MUST_IDX.length;
  N_PAT=2**OPT.length;
}
useRoute(ROUTE_DEF);
const routeTitle=r=>r.kind==="kcic"?"Alternative "+r.alt+" · "+r.name:r.name;
const ROUTE_GROUP={kcic:"KCIC pre-feasibility study, 2024",combo:"Other ways to join the mapped corridors"};
const extKmText=r=>r.kind==="kcic"?fmtNum(r.extKm,2)+" km":"about "+fmtNum(r.extKm,0)+" km";
// city speed limit applies around the two ends, and around Tegalluar on the routes that pass it
const zonesFor=(r,L)=>r.skipsBandung?[0,L]:[0,L,WHOOSH_KM];
const hav=(a,b)=>{const R=6371.0088,r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lon-a.lon)*r;const h=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
const GC_KM=hav(ROUTE.airports.HLP,ROUTE.airports.SUB), GC_CGK=hav(ROUTE.airports.CGK,ROUTE.airports.SUB);

// ---------- formatting ----------
function fmtNum(v,d){if(!isFinite(v))return"∞";return v.toLocaleString("en-US",{maximumFractionDigits:d,minimumFractionDigits:0});}
function fmtRp(v){if(!isFinite(v))return"Rp ∞";const a=Math.abs(v);if(a>=1e12)return"Rp "+fmtNum(v/1e12,a>=1e14?0:1)+" trillion";if(a>=1e10)return"Rp "+fmtNum(v/1e9,a>=1e11?0:1)+" billion";return"Rp "+fmtNum(Math.round(v/1000)*1000,0);}
function fmtRpM(v){return"Rp "+fmtNum(v/1e6,2)+" M";}
function fmtUSD(v){if(!isFinite(v))return"$∞";const a=Math.abs(v);return a>=1e9?"$"+fmtNum(v/1e9,a>=1e11?0:1)+" B":a>=1e6?"$"+fmtNum(v/1e6,a>=1e8?0:1)+" M":"$"+fmtNum(v,a<100?2:0);}
function fmtDur(min){if(!isFinite(min))return"∞";min=Math.round(min);const h=Math.floor(min/60),m=min-h*60;return h?h+" h "+String(m).padStart(2,"0")+" min":m+" min";}
function fmtHM(min){min=Math.round(min);return Math.floor(min/60)+":"+String(min%60).padStart(2,"0");}
const fmtKg1=v=>(v<10?v.toFixed(v<1?2:1):fmtNum(v,0))+" kg";
const fmtKg=v=>fmtNum(v,v<10?1:0)+" kg";
const fmtT=v=>v>=1e6?fmtNum(v/1e6,2)+" Mt":v>=1e3?fmtNum(v/1e3,v>=1e4?0:1)+" kt":fmtNum(v,0)+" t";
const pct=(v,d=0)=>fmtNum(v*100,d)+" %";
const flag=(t,c)=>`<span class="flag ${c}">${t}</span>`;
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ---------- references ----------
const W_="https://en.wikipedia.org/wiki/";
const LK=(t,u)=>[t,u];
const N_TEMPO=LK("Tempo — Surabaya extension under review, says ministry","https://en.tempo.co/read/2034920/jakarta-bandung-high-speed-rail-extension-to-surabaya-under-review-says-ministry");
const N_SCMP=LK("South China Morning Post — Indonesia eyes high-speed rail to Surabaya, but China debt barriers loom","https://www.scmp.com/week-asia/economics/article/3312518/indonesia-eyes-high-speed-rail-surabaya-china-debt-barriers-loom");
const N_FARES=LK("Bisnis.com — Whoosh fares and discounts, May 2026","https://ekonomi.bisnis.com/read/20260527/98/1976717/kcic-tebar-diskon-tiket-kereta-cepat-whoosh-libur-iduladha-cek-syaratnya");
const N_DYN=LK("Kontan — Whoosh dynamic pricing from Rp 150,000","https://momsmoney.kontan.co.id/news/whoosh-berlakukan-tarif-dinamis-intip-bocoran-jadwal-dengan-harga-termurah");
const N_TBA=LK("Hukumonline — fare ceiling and floor for Jakarta–Surabaya under KM 106/2019","https://www.hukumonline.com/berita/a/kemenhub-diminta-tegas-atur-tarif-tiket-pesawat-lt5ce919e3436df/");
const N_FUXING=LK("China Daily — Fuxing uses about 3.8 kWh per 100 passenger-km at 350 km/h","https://covid-19.chinadaily.com.cn/m/qingdao/2017-09/29/content_33316825.htm");
const N_JCM=LK("JCM / GEC — grid emission factors for Indonesia","https://gec.jp/innovation/R4/T.CO2EmissionFactor_20220406.pdf");
const WHOOSH=LK("Wikipedia — High-speed rail in Indonesia (Whoosh)",W_+"High-speed_rail_in_Indonesia");
const HSR=LK("Wikipedia — High-speed rail",W_+"High-speed_rail");
const REFS={
 premise:{t:"Extending Whoosh to Surabaya",d:"Whoosh is the 142.3 km, 350 km/h line between Jakarta (Halim) and Bandung (Tegalluar) that opened in October 2023. Extending it to Surabaya has been discussed by successive governments; as of 2026 it is still under study, and officials have tied it to resolving the debt of the first line. No route has been fixed. This page models the three alternatives of KCIC's pre-feasibility study and the other combinations of the corridors on its map.",l:[WHOOSH,LK("Wikipedia — Rail transport in Indonesia",W_+"Rail_transport_in_Indonesia"),LK("Wikipedia — Kereta Cepat Indonesia China",W_+"Kereta_Cepat_Indonesia_China"),N_TEMPO,N_SCMP,LK("Tempo — national high-speed rail committee to address Whoosh issues","https://en.tempo.co/read/2081787/indonesia-to-form-high-speed-rail-committee-to-address-whoosh-issues"),LK("Seasia — Whoosh marks two years, prepares for next phase to Surabaya","https://seasia.co/2025/10/22/indonesias-whoosh-marks-two-years-prepares-for-next-phase-to-surabaya"),LK("Katadata — Jakarta–Surabaya high-speed train plan is on again (2023)","https://dinsights.katadata.co.id/read/2023/10/03/jakarta-surabaya-high-speed-train-plan-is-on-again"),LK("Wikipedia — Jakarta–Surabaya line (the conventional railway)",W_+"Jakarta%E2%80%93Surabaya_line")]},
 routes:{t:"Route alternatives",d:"Seven ways to draw the line to Surabaya. Three are the alternatives of KCIC's pre-feasibility study of 2024, still under review, taken from the comparison map that Kompas.id published in December 2024. Each is measured from Tegalluar: Lintas Selatan via Kroya and Yogyakarta (629.45 km, 21.25 km of it in tunnel, 13 stations and 1 in reserve, 180 minutes), Lintas Tengah via Cirebon and Purwokerto (679.19 km, 44.61 km in tunnel, 15 stations and 1 in reserve, 193 minutes) and Lintas Utara via Cirebon and Semarang (641.96 km, 51.95 km in tunnel, 14 stations and 1 in reserve, 184 minutes). KCIC's consultant recommended the southern one. All three share the line from Solo to Surabaya, and the southern and central ones share Kroya to Solo. The map names the stations. Names in red add up to the published counts; Sumedang, Garut and Cilacap, in green, are taken to be the reserve stations, which gives the southern line two where its legend says one. The map is a sketch on a base map, so each line is redrawn here as a smooth curve through its stations, and distances are stretched by 4–5 % to the published length. The same map shows the north-coast corridor of JICA's semi-high-speed study: 713 km from Jakarta, 5 passenger stations, 5.5 hours. The last four options are the other ways of joining these corridors end to end: Lintas Utara as far as Semarang and then the coast, and three that leave the built line at Karawang, skip Bandung and follow the coast to Cirebon, continuing along Lintas Tengah, along Lintas Utara through Solo, or along the coast throughout. None of the four is an alternative of either study, and that the coastal line would branch off at Karawang is this page's assumption. Their lengths are estimates and their stations on JICA's corridor are inferred. Routes that reach Surabaya along the coast end at Pasar Turi, the others at Waru.",l:[LK("Kontan — three alternative alignments for the Whoosh extension (2025)","https://industri.kontan.co.id/news/bandung-surabaya-cuma-3-jam-ini-tiga-alternatif-jalur-perpanjangan-whoosh"),LK("Kompas — KCIC on the Surabaya extension (February 2025)","https://money.kompas.com/read/2025/02/14/142626826/apa-kabar-proyek-perpanjangan-whoosh-ke-surabaya-ini-kata-kcic?page=all"),LK("CNBC Indonesia — planned Jakarta–Surabaya route, phasing and KCIC's recommendation (July 2025)","https://www.cnbcindonesia.com/news/20250729162059-4-653281/rencana-rute-kereta-cepat-jakarta-surabaya-era-jokowi-lewat-sini"),LK("Okezone — three route options named by the transport minister (October 2024)","https://economy.okezone.com/read/2024/10/06/320/3071420/3-opsi-jalur-kereta-cepat-jakarta-surabaya"),LK("Kompas.id — the strategic plan for the Jakarta–Surabaya high-speed railway, with the comparison map (subscription)","https://www.kompas.id/artikel/keberlanjutan-kereta-cepat-infrastruktur-untuk-siapa"),LK("Wikipedia — Kereta Cepat Indonesia China",W_+"Kereta_Cepat_Indonesia_China")]},
 grade:{t:"Gradients",d:"The ground under each line is sampled every 500 m from SRTM satellite elevation data. A railway cannot follow the ground, so a rail level is derived from it: the mean of the highest and the lowest profile that stay within 30 ‰ of slope, the steepest gradient on the built line, smoothed for vertical curves. Where the ground rises well above that level the line would be in tunnel; where it falls well below, on viaduct. Gravity then adds weight × slope to the running resistance. Climbing costs energy and, on the steepest climbs, speed, because the traction power left over at 350 km/h holds only about 8 ‰. Descending gives the energy back: all of it while it merely eases the motors, and the share recovered by regenerative braking once the train has to hold itself back. Timetables and fares use the eastbound run; energy is the mean of the two directions. The rail level is an estimate along a schematic alignment, not a design. A real alignment picks its way around hills that this one crosses, and this method finds only about a quarter of the tunnel length reported for the built line, and 57–70 % of that reported for KCIC's alternatives.",l:[LK("Wikipedia — Shuttle Radar Topography Mission",W_+"Shuttle_Radar_Topography_Mission"),LK("OpenTopoData — SRTM 30 m elevation dataset","https://www.opentopodata.org/datasets/srtm/"),LK("Wikipedia — Grade (slope)",W_+"Grade_(slope)"),LK("Wikipedia — Ruling gradient",W_+"Ruling_gradient"),LK("Wikipedia — Regenerative braking",W_+"Regenerative_braking")]},
 fsur:{t:"Flight surcharge",d:"A levy the government could put on every Jakarta–Surabaya air ticket to move travellers to the train and leave flying as the premium option. It is added to both flights on top of the airline's fare, so it raises what a flyer pays, enters the generalised cost and the traveller's verdict, and lifts the flight-fare line in the stopping-pattern chart. The comparison table gives the surcharge at which the train ties each flight and the one at which the verdict turns to the train; both follow from the other inputs and do not depend on this slider. What it does not do here: change the airline's own fare, the flight's emissions or the number of train passengers, which stays an input, and the money it would raise is not counted. The rail-share tile shows what the rule of thumb would give if the surcharge were worth its equivalent in travel time, which is only an indication. Today's regulation points the other way, capping economy fares on this route at Rp 1,167,000 before tax. Air passenger taxes elsewhere are small by comparison, a few to a few tens of US dollars on short flights; France has gone further and banned domestic flights where a train does the trip in under two and a half hours.",l:[N_TBA,LK("Wikipedia — Departure tax (air passenger taxes by country)",W_+"Departure_tax"),LK("Wikipedia — Air Passenger Duty (United Kingdom)",W_+"Air_Passenger_Duty"),LK("Wikipedia — Short-haul flight ban",W_+"Short-haul_flight_ban"),LK("Wikipedia — Pigouvian tax",W_+"Pigouvian_tax"),LK("Wikipedia — Generalised cost",W_+"Generalised_cost")]},
 stops:{t:"Stops",d:"Jakarta, both Bandung stations (Padalarang and Tegalluar) and Surabaya are always served, as every Whoosh train does today; routes that leave the built line at Karawang always serve only Jakarta and Surabaya. The optional stations sit where the line passes each city. Every stop costs braking, dwell and re-acceleration time, and adds a station to pay for; it also brings the city's passengers. Existing stations are at their real positions (Padalarang falls at km 110 of the traced line; the 55.6 km and 45.6 km spacings often quoted date from the 2021 plan with a station at Walini, and are shorter than the 61 km straight line from Karawang to Padalarang); new ones are placed at the point of the route nearest each city centre. On the KCIC alternatives the stations are those named on the study's map, the reserve ones included. Stations marked inferred lie on corridors the study does not cover.",l:[LK("Wikipedia — Halim railway station",W_+"Halim_railway_station"),LK("Wikipedia — Karawang HSR station",W_+"Karawang_HSR_station"),LK("Wikipedia — Tegalluar railway station",W_+"Tegalluar_railway_station"),LK("Wikipedia — Cirebon",W_+"Cirebon"),LK("Wikipedia — Pekalongan",W_+"Pekalongan"),LK("Wikipedia — Semarang",W_+"Semarang"),LK("Wikipedia — Surakarta",W_+"Surakarta"),LK("Wikipedia — Madiun",W_+"Madiun"),LK("Wikipedia — Surabaya",W_+"Surabaya"),LK("Wikipedia — Dwell time (transportation)",W_+"Dwell_time_(transportation)")]},
 sec_map:{t:"Route map",d:"The built line is the real track geometry from OpenStreetMap. The new line is drawn as a smooth curve through the stations on the map of KCIC's pre-feasibility study, which is a sketch and not a surveyed alignment, with distances scaled to the published or estimated length; the alignment slider scales it further. The routes not chosen appear as thin dashed lines.",l:[LK("Kompas.id — the strategic plan for the Jakarta–Surabaya high-speed railway, with the comparison map (subscription)","https://www.kompas.id/artikel/keberlanjutan-kereta-cepat-infrastruktur-untuk-siapa"),LK("Wikipedia — Kereta Cepat Indonesia China",W_+"Kereta_Cepat_Indonesia_China"),LK("Wikipedia — OpenStreetMap",W_+"OpenStreetMap"),LK("Wikipedia — Centripetal Catmull–Rom spline",W_+"Centripetal_Catmull%E2%80%93Rom_spline")]},
 sec_speed:{t:"Speed profile",d:"Between two stops the train accelerates at the starting acceleration until traction power becomes the limit, then at whatever the remaining power allows after rolling and air resistance; it cruises at the speed limit and brakes at the service rate so that it stops exactly at the platform. Lower limits apply within 8 km of the Jakarta, Bandung and Surabaya stations. With gradients switched on, gravity along the rail level drawn under the chart pulls the train back on climbs and helps it on descents. Curves are ignored.",l:[LK("Wikipedia — Tractive effort",W_+"Tractive_effort"),LK("Wikipedia — Rolling resistance (railway)",W_+"Rolling_resistance"),LK("Wikipedia — Drag (physics)",W_+"Drag_(physics)"),LK("Wikipedia — Fuxing (train)",W_+"Fuxing_(train)"),LK("Wikipedia — China Railway CR400AF (parent of the KCIC400AF)",W_+"China_Railway_CR400AF"),LK("Wikipedia — Railway brake",W_+"Railway_brake")]},
 alignf:{t:"Alignment length",d:"Scales the length of the new line. On a KCIC alternative 1 keeps the length published in the study; on the other combinations it keeps this page's estimate. The alignment itself has not been surveyed: a 350 km/h railway needs curves of about 7 km radius under Chinese standards (5.5 km at the limit), so the final line may run straighter or less straight than the study assumed, and the length would change with it.",l:[LK("Wikipedia — Minimum railway curve radius",W_+"Minimum_railway_curve_radius"),HSR]},
 vmax:{t:"Line speed",d:"Maximum speed in regular service. Whoosh runs at 350 km/h, the same as the fastest Chinese lines; most European and Japanese lines run at 300–320 km/h.",l:[WHOOSH,LK("Wikipedia — China Railway CR400AF (parent of the KCIC400AF)",W_+"China_Railway_CR400AF"),LK("Wikipedia — Fuxing (train)",W_+"Fuxing_(train)"),LK("Wikipedia — List of high-speed railway lines",W_+"List_of_high-speed_railway_lines")]},
 vurb:{t:"Speed limit near the main stations",d:"Lines enter big cities on tighter curves and shared corridors, so trains run slower there. Applied within 8 km of Halim, Tegalluar and the Surabaya terminus.",l:[LK("Wikipedia — Halim railway station",W_+"Halim_railway_station"),LK("Wikipedia — Rail speed limits in the United States (how limits are set)",W_+"Rail_speed_limits_in_the_United_States"),LK("Wikipedia — Minimum railway curve radius",W_+"Minimum_railway_curve_radius")]},
 pwr:{t:"Traction power",d:"Continuous power at the wheels of one 8-car set. It decides how quickly the train reaches top speed and whether it can hold it.",l:[LK("Wikipedia — Fuxing (train), CR400AF specifications",W_+"Fuxing_(train)"),LK("Wikipedia — China Railway CR400AF (parent of the KCIC400AF)",W_+"China_Railway_CR400AF"),LK("Wikipedia — Tractive effort",W_+"Tractive_effort"),LK("Wikipedia — Electric multiple unit",W_+"Electric_multiple_unit")]},
 mass:{t:"Train mass",d:"Loaded mass of the 8-car set. Heavier trains accelerate more slowly and store more kinetic energy to dissipate or regenerate at every stop.",l:[LK("Wikipedia — China Railway CR400AF (parent of the KCIC400AF)",W_+"China_Railway_CR400AF"),LK("Wikipedia — Fuxing (train)",W_+"Fuxing_(train)"),LK("Wikipedia — Kinetic energy",W_+"Kinetic_energy")]},
 acc:{t:"Starting acceleration",l:[LK("Wikipedia — Tractive effort",W_+"Tractive_effort"),LK("Wikipedia — Adhesion railway",W_+"Adhesion_railway"),LK("Wikipedia — Fuxing (train)",W_+"Fuxing_(train)")]},
 dec:{t:"Service braking",l:[LK("Wikipedia — Railway brake",W_+"Railway_brake"),LK("Wikipedia — Regenerative braking",W_+"Regenerative_braking"),LK("Wikipedia — Braking distance",W_+"Braking_distance")]},
 dwell:{t:"Dwell time",d:"Time standing at each intermediate station.",l:[LK("Wikipedia — Dwell time (transportation)",W_+"Dwell_time_(transportation)"),WHOOSH]},
 pad:{t:"Timetable margin",d:"Published timetables are slower than the fastest possible run so that small delays can be recovered. Whoosh's timetable of about 45–55 minutes for 142 km is well above the minimum running time.",l:[LK("Wikipedia — Public transport timetable",W_+"Public_transport_timetable"),LK("Metro TV — Whoosh timetable, 2026","https://www.metrotvnews.com/read/NgxCawB2-cara-mudah-beli-tiket-dan-boarding-kereta-whoosh-beserta-jadwal-lengkapnya"),WHOOSH]},
 fjb:{t:"Jakarta–Bandung fare",d:"Premium Economy, Halim–Tegalluar, one way. KCIC prices dynamically: in tiers of Rp 150,000, 175,000, 200,000, 225,000 and 250,000; Rp 300,000 was the list price at opening in 2023. Everything on the fare side is scaled from this number.",l:[N_FARES,N_DYN,LK("KCIC — official ticketing site","https://ticket.kcic.co.id/"),WHOOSH,LK("Wikipedia — Dynamic pricing",W_+"Dynamic_pricing")]},
 beta:{t:"Distance taper",d:"How the distance-driven part of the fare grows with distance: fare ∝ distance^β. β = 1 is a flat price per kilometre, as on Chinese high-speed lines. KCIC's own Halim–Karawang fare (Rp 100,000–125,000, or 50–65 % of the Bandung fare for 29 % of the distance) implies β between 0.35 and 0.55, steeper than this slider allows. Most railways sit in between.",l:[LK("Wikipedia — Fare",W_+"Fare"),LK("Wikipedia — Beijing–Shanghai high-speed railway",W_+"Beijing%E2%80%93Shanghai_high-speed_railway"),LK("Wikipedia — Tokaido Shinkansen",W_+"Tokaido_Shinkansen"),N_FARES]},
 st:{t:"Time-driven share of the fare",d:"Part of today's fare that pays for things that scale with hours rather than kilometres: trainsets and crews. A train that takes longer makes fewer trips a day, so each seat has to earn more. This is how extra stops raise the fare.",l:[LK("Wikipedia — Operating expense",W_+"Operating_expense"),LK("Wikipedia — Rolling stock",W_+"Rolling_stock"),HSR]},
 ss:{t:"Station-driven share of the fare",d:"Part of today's fare that pays for stations. It scales with the number of stations a train serves between the passenger's origin and destination.",l:[LK("Wikipedia — Train station",W_+"Train_station"),LK("Wikipedia — Halim railway station",W_+"Halim_railway_station")]},
 fx:{t:"Exchange rate",l:[LK("Wikipedia — Indonesian rupiah",W_+"Indonesian_rupiah"),LK("Bank Indonesia — exchange rates","https://www.bi.go.id/en/statistik/informasi-kurs/transaksi-bi/default.aspx")]},
 cgkshare:{t:"Two Jakarta airports",d:"Jakarta–Surabaya flights leave from two airports. Halim (HLP) is inside the city, next to the Whoosh station, but has one runway and few slots. Soekarno–Hatta (CGK) in Tangerang carries most of the traffic and is farther out: about 20 km from Monas in a straight line against 12 km for Halim, and 26 km against 20 km by road. Schedule aggregators consulted in November 2026 list about 28–31 daily CGK–SUB flights and 9–10 daily HLP–SUB flights; they disagree with each other, no official route statistics were found, and Batik Air moved part of its Halim schedule to Soekarno–Hatta in 2025, so the 75 % default is a rough estimate. The averages weight fare, time and CO₂ by this share; both legs are also shown separately.",l:[LK("Wikipedia — Halim Perdanakusuma International Airport",W_+"Halim_Perdanakusuma_International_Airport"),LK("Wikipedia — Soekarno–Hatta International Airport",W_+"Soekarno–Hatta_International_Airport"),LK("Wikipedia — Juanda International Airport",W_+"Juanda_International_Airport"),LK("Wikipedia — List of busiest passenger flight routes",W_+"List_of_busiest_passenger_flight_routes"),LK("Kontan — Batik Air and Citilink flights moved from Halim to Soekarno–Hatta","https://industri.kontan.co.id/news/daftar-rute-17-penerbangan-batik-air-citilink-yang-pindah-ke-bandara-soekarno-hatta"),LK("Republika — Garuda group concentrates Citilink at Halim (Jan 2026)","https://ekonomi.republika.co.id/berita/t9bdm8490/garuda-indonesia-fokuskan-citilink-layani-penerbangan-halim"),LK("FlightsFrom — HLP–SUB schedule","https://www.flightsfrom.com/HLP-SUB"),LK("FlightConnections — SUB–CGK schedule","https://www.flightconnections.com/flights-from-sub-to-cgk")]},
 cfare:{t:"CGK–SUB fare",d:"One-way economy fare from Soekarno–Hatta, all-in. The regulated ceiling and floor are set per city pair, so the band is the same as from Halim. Lion Air, Super Air Jet, Citilink, Batik Air, Garuda Indonesia and Pelita Air compete here. Booking sites in November 2026 showed Citilink from Rp 766,000 at Halim and Rp 780,000 at Soekarno–Hatta, and Batik Air from Rp 1,169,000 at Halim, so no Halim premium is assumed.",l:[N_TBA,LK("Wikipedia — Soekarno–Hatta International Airport",W_+"Soekarno–Hatta_International_Airport"),LK("Wikipedia — Lion Air",W_+"Lion_Air"),LK("Wikipedia — Super Air Jet",W_+"Super_Air_Jet"),LK("Wikipedia — Garuda Indonesia",W_+"Garuda_Indonesia"),LK("Wikipedia — Pelita Air",W_+"Pelita_Air"),LK("Wikipedia — Low-cost carrier",W_+"Low-cost_carrier")]},
 cblock:{t:"CGK–SUB block time",d:"Gate to gate. Soekarno–Hatta is about 30 km farther from Surabaya than Halim and has three runways and long taxiways, so scheduled times run a few minutes longer.",l:[LK("Wikipedia — Soekarno–Hatta International Airport",W_+"Soekarno–Hatta_International_Airport"),LK("Wikipedia — Flight length (block time)",W_+"Flight_length"),LK("Wikipedia — Taxiing",W_+"Taxiing")]},
 cacc:{t:"Getting to Soekarno–Hatta",d:"The airport is in Tangerang, about 26 km by toll road from Monas against about 20 km for Halim (20 km and 12 km in a straight line). The airport rail link takes 40 minutes from BNI City and 46 from Manggarai since July 2025; by road the trip takes 45 minutes to well over an hour depending on traffic. This is the main time penalty of flying from CGK.",l:[LK("Wikipedia — Soekarno–Hatta Airport Commuter Line",W_+"Soekarno–Hatta_Airport_Commuter_Line"),LK("Wikipedia — Soekarno–Hatta International Airport",W_+"Soekarno–Hatta_International_Airport"),LK("Wikipedia — Prof. Dr. Ir. Soedijatmo Toll Road",W_+"Prof._Dr._Ir._Soedijatmo_Toll_Road"),LK("Wikipedia — Transport in Jakarta",W_+"Transport_in_Jakarta")]},
 ffare:{t:"HLP–SUB fare",d:"One-way economy fare, Halim Perdanakusuma to Juanda, including taxes and airport charges. Indonesia regulates domestic economy fares: for Jakarta–Surabaya the 2019 decree sets a full-service ceiling of Rp 1,167,000 and a floor of Rp 408,000 before tax and passenger service charge. Low-cost carriers are capped lower.",l:[N_TBA,LK("Wikipedia — Halim Perdanakusuma International Airport",W_+"Halim_Perdanakusuma_International_Airport"),LK("Wikipedia — Juanda International Airport",W_+"Juanda_International_Airport"),LK("Wikipedia — Citilink",W_+"Citilink"),LK("Wikipedia — Batik Air",W_+"Batik_Air"),LK("Wikipedia — List of busiest passenger flight routes",W_+"List_of_busiest_passenger_flight_routes")]},
 fblock:{t:"Flight block time",d:"Gate to gate, including taxi. The great-circle distance is only about 660 km, so roughly half the block time is spent taxiing, climbing and descending.",l:[LK("Wikipedia — Flight length (block time)",W_+"Flight_length"),LK("Wikipedia — Great-circle distance",W_+"Great-circle_distance"),LK("Wikipedia — Airbus A320 family",W_+"Airbus_A320_family")]},
 fpre:{t:"Time at the airport before departure",l:[LK("Wikipedia — Airport check-in",W_+"Airport_check-in"),LK("Wikipedia — Airport security",W_+"Airport_security")]},
 fpost:{t:"Leaving the aircraft and the airport",l:[LK("Wikipedia — Baggage reclaim",W_+"Baggage_reclaim"),LK("Wikipedia — Juanda International Airport",W_+"Juanda_International_Airport")]},
 facc:{t:"Getting to and from the airports",d:"Halim airport is inside Jakarta; its terminal is about 2.5 km from the Whoosh station in a straight line and 7 km by road, so the Jakarta end is nearly the same for the train and the Halim flight. Soekarno–Hatta is farther out and has its own slider. Juanda is about 15 km south of central Surabaya in a straight line and 22 km by road.",l:[LK("Wikipedia — Halim Perdanakusuma International Airport",W_+"Halim_Perdanakusuma_International_Airport"),LK("Wikipedia — Juanda International Airport",W_+"Juanda_International_Airport"),LK("Wikipedia — Transport in Jakarta",W_+"Transport_in_Jakarta")]},
 tacc:{t:"Getting to and from the stations",d:"Halim station connects to the Jabodebek LRT. The modeled Surabaya terminus is at the Waru interchange on the southern edge of the city, about 11 km from the centre in a straight line and 18 km by road. That is this page's assumption: the study's map places the terminus only roughly. Routes that follow the north coast into Surabaya end at Pasar Turi, in the centre.",l:[LK("Wikipedia — Halim railway station",W_+"Halim_railway_station"),LK("Wikipedia — Jabodebek LRT",W_+"Jabodebek_LRT"),LK("Wikipedia — Surabaya",W_+"Surabaya")]},
 tpre:{t:"Time at the station before departure",l:[WHOOSH,LK("Wikipedia — Train station",W_+"Train_station")]},
 vot:{t:"Value of travel time",d:"What an hour of the traveller's time is worth. It converts the time difference into money so that time and price can be compared in one number, the generalised cost.",l:[LK("Wikipedia — Value of time",W_+"Value_of_time"),LK("Wikipedia — Generalised cost",W_+"Generalised_cost"),LK("Wikipedia — Economy of Indonesia",W_+"Economy_of_Indonesia")]},
 capex:{t:"Construction cost per km",d:"All-in cost of the new line per route-km, including stations and systems. The first Whoosh line cost about US$7.3 billion for 142.3 km, or US$51 million per km, with long tunnels and viaducts. Chinese domestic lines have cost roughly US$17–21 million per km.",l:[WHOOSH,LK("Wikipedia — Kereta Cepat Indonesia China",W_+"Kereta_Cepat_Indonesia_China"),LK("Wikipedia — High-speed rail in China",W_+"High-speed_rail_in_China"),N_SCMP]},
 trains:{t:"Trains per day",d:"Departures per direction per day. Whoosh has run between 40 and 62 trips a day in total, or 20–31 each way.",l:[WHOOSH,LK("Wikipedia — Headway",W_+"Headway")]},
 lf:{t:"Train load factor",d:"Share of seat-kilometres sold over the whole line. Whoosh carries about 6 million passengers a year.",l:[LK("Wikipedia — Passenger load factor",W_+"Passenger_load_factor"),WHOOSH]},
 opex_train:{t:"Train operating cost",d:"Crew, cleaning, train maintenance and the capital cost of the trainsets, per train-kilometre, excluding traction energy, which is computed separately.",l:[LK("Wikipedia — Operating expense",W_+"Operating_expense"),HSR,LK("Wikipedia — China Railway CR400AF (parent of the KCIC400AF)",W_+"China_Railway_CR400AF")]},
 opex_infra:{t:"Infrastructure maintenance",d:"Track, overhead line, signalling and structures, per route-km per year.",l:[LK("Wikipedia — Track (rail transport), maintenance",W_+"Railway_track"),LK("Wikipedia — Overhead line",W_+"Overhead_line"),HSR]},
 elec:{t:"Electricity price",l:[LK("Wikipedia — Perusahaan Listrik Negara",W_+"Perusahaan_Listrik_Negara"),LK("Wikipedia — Energy in Indonesia",W_+"Energy_in_Indonesia")]},
 wacc:{t:"Cost of capital",d:"Annual rate used to turn the construction cost into a yearly payment. The first line was financed mainly by China Development Bank at about 2 % for the original budget and 3.4 % for the overrun; Indonesian 10-year government bonds yielded between 6 % and 7.7 % over 2025–26 (7.5 % in November 2026).",l:[LK("Wikipedia — Weighted average cost of capital",W_+"Weighted_average_cost_of_capital"),LK("Wikipedia — Capital recovery factor",W_+"Capital_recovery_factor"),LK("Wikipedia — China Development Bank",W_+"China_Development_Bank"),N_SCMP]},
 trainco2:{t:"Building the trains",d:"An 8-car set weighs about 450 t empty, mostly aluminium and steel. At roughly 8 kg CO₂e per kg of finished rail vehicle that is about 3,500 t per set; this factor is an estimate, not a published figure for the CR400AF. The fleet is the number of sets the timetable needs plus 10 % spares, and each set is assumed to last 30 years. The result is a fraction of a kilogram per passenger, about 0.25 g per passenger-km; SNCF attributes 0.6 g per passenger-km to building its TGVs, so the true figure may be two to three times higher and still negligible.",l:[LK("Wikipedia — China Railway CR400AF",W_+"China_Railway_CR400AF"),LK("Wikipedia — Rolling stock",W_+"Rolling_stock"),LK("Wikipedia — Life-cycle assessment",W_+"Life-cycle_assessment"),LK("Wikipedia — Embedded emissions",W_+"Embedded_emissions"),LK("Chester & Horvath 2009 — Environmental assessment of passenger transportation should include infrastructure and supply chains","https://iopscience.iop.org/article/10.1088/1748-9326/4/2/024008")]},
 planeco2:{t:"Building the aircraft",d:"An Airbus A320 weighs about 43 t empty. Aerospace aluminium, titanium and carbon fibre carry far more carbon per kilogram than structural steel, and much of the raw material is machined away, so the default uses about 35 kg CO₂e per kg, or 1,500 t per aircraft. A published study of one V2500 engine alone puts its production above 65 t CO₂e. The aircraft is assumed to fly 40,000 flights in its life (the A320's original design goal was 48,000). Life-cycle studies of the A320 agree that manufacture is a very small part of its lifetime emissions: McKinsey puts manufacturing, materials and maintenance at about 1 % and Boeing at under 2 %, which would be 3,500–7,000 t on this duty; the 1,500 t default is an estimate for manufacture alone and no published per-aircraft figure was found.",l:[LK("Wikipedia — Airbus A320 family",W_+"Airbus_A320_family"),LK("Wikipedia — IAE V2500",W_+"IAE_V2500"),LK("Wikipedia — Environmental impact of aviation",W_+"Environmental_impact_of_aviation"),LK("Wikipedia — Life-cycle assessment",W_+"Life-cycle_assessment"),LK("Wikipedia — Embedded emissions",W_+"Embedded_emissions"),LK("Chester & Horvath 2009 — Environmental assessment of passenger transportation should include infrastructure and supply chains","https://iopscience.iop.org/article/10.1088/1748-9326/4/2/024008"),LK("Encyclopedia.pub — Life cycle assessment in aviation (overview of A320 studies)","https://encyclopedia.pub/entry/27024"),LK("DLR — Life cycle assessment of turbofan engines","https://elib.dlr.de/215424/1/Oestreicher_2025_Life%20Cycle%20Assessment%20of%20Turbofan%20Engines%20-%20A%20Reverse%20Engineering%20Approach.pdf")]},
 apco2:{t:"Building the airports",d:"A rough bottom-up estimate. A large airport such as Soekarno–Hatta has several million square metres of thick concrete pavement and about a million square metres of terminal: of the order of 1.5 to 2 million tonnes of CO₂. Spread over 60 years at about 55 million passengers a year that is roughly 0.5 kg per passenger. Juanda and Halim are smaller but also carry fewer passengers, so the same figure is used for each end, 1 kg per trip. Two caveats. The figure is an estimate; no published per-passenger figure was found. And the airports already exist while the railway does not: a new line adds its construction carbon to the atmosphere, whereas flying tomorrow adds nothing for runways poured decades ago. Set this to zero for that marginal view; the carbon payback always uses it.",l:[LK("Wikipedia — Soekarno–Hatta International Airport",W_+"Soekarno–Hatta_International_Airport"),LK("Wikipedia — Juanda International Airport",W_+"Juanda_International_Airport"),LK("Wikipedia — Runway",W_+"Runway"),LK("Wikipedia — Environmental impact of concrete",W_+"Environmental_impact_of_concrete"),LK("Wikipedia — Life-cycle assessment",W_+"Life-cycle_assessment"),LK("Wikipedia — Embedded emissions",W_+"Embedded_emissions"),LK("Chester & Horvath 2009 — Environmental assessment of passenger transportation should include infrastructure and supply chains","https://iopscience.iop.org/article/10.1088/1748-9326/4/2/024008"),LK("Greer, Rakas & Horvath 2020 — Airports and environmental sustainability: a comprehensive review","https://its.berkeley.edu/publications/airports-and-environmental-sustainability-comprehensive-review")]},
 clife:{t:"Carbon accounting period",d:"Years over which the carbon emitted during construction is spread. Life-cycle studies of railways usually use 60 to 100 years for civil structures.",l:[LK("Wikipedia — Life-cycle assessment",W_+"Life-cycle_assessment"),LK("Wikipedia — Embedded emissions",W_+"Embedded_emissions")]},
 life:{t:"Asset life",d:"Years over which the construction cost is repaid.",l:[LK("Wikipedia — Depreciation",W_+"Depreciation"),LK("Wikipedia — Capital recovery factor",W_+"Capital_recovery_factor")]},
 eta:{t:"Drivetrain efficiency",d:"Overhead line to wheel: transformer, converters, motors and gears.",l:[LK("Wikipedia — Electric multiple unit",W_+"Electric_multiple_unit"),LK("Wikipedia — Traction motor",W_+"Traction_motor"),LK("Wikipedia — Energy efficiency in transport",W_+"Energy_efficiency_in_transport")]},
 regen:{t:"Regenerative braking",d:"Share of braking energy at the wheel that is recovered. It goes back through the drivetrain, so it is multiplied by the drivetrain efficiency again.",l:[LK("Wikipedia — Regenerative braking",W_+"Regenerative_braking"),LK("Wikipedia — Railway electrification",W_+"Railway_electrification")]},
 aux:{t:"Auxiliary power",d:"Air conditioning, lighting and on-board systems, drawn the whole time including at stations.",l:[LK("Wikipedia — Head-end power",W_+"Head-end_power"),LK("Wikipedia — Energy efficiency in transport",W_+"Energy_efficiency_in_transport")]},
 grid:{t:"Grid carbon intensity",d:"CO₂ emitted per kWh delivered to the train. The Java–Madura–Bali grid is dominated by coal; published factors for it disagree, from about 0.53 to 0.87 kg/kWh depending on year and method, and a 2025 press figure puts the average near 0.8, which is the default here. Indonesia as a whole was 680 g/kWh in 2024 and the world 460–470.",l:[N_JCM,LK("Wikipedia — Energy in Indonesia",W_+"Energy_in_Indonesia"),LK("Wikipedia — Emission intensity",W_+"Emission_intensity"),LK("Wikipedia — Coal in Indonesia",W_+"Coal_in_Indonesia")]},
 infraco2:{t:"Construction carbon",d:"CO₂ emitted to build the line (concrete, steel, earthworks), per route-km. Published life-cycle studies range from about 6,000 t/km for lines on embankment to about 30,000 t/km for lines that are mostly viaduct and tunnel: 8,800 for France's LGV Méditerranée, 29,000 for Beijing–Tianjin, which is 84 % bridge. It is spread over the accounting period below and over all passengers.",l:[LK("Wikipedia — Embedded emissions",W_+"Embedded_emissions"),LK("Wikipedia — Life-cycle assessment",W_+"Life-cycle_assessment"),LK("Wikipedia — Environmental impact of concrete",W_+"Environmental_impact_of_concrete"),LK("Wikipedia — Environmental design in rail transportation",W_+"Environmental_design_in_rail_transportation")]},
 divert:{t:"Riders who would otherwise fly",d:"Only passengers taken out of aircraft save aviation emissions. The rest come from cars, buses and conventional trains, or would not have travelled; they are treated as neutral here. Like the revenue, the saving is credited to the extension by its share of the route length.",l:[LK("Wikipedia — Modal share",W_+"Modal_share"),LK("Wikipedia — Induced demand",W_+"Induced_demand"),HSR]},
 seatsair:{t:"Aircraft seats",l:[LK("Wikipedia — Airbus A320 family",W_+"Airbus_A320_family"),LK("Wikipedia — Citilink",W_+"Citilink"),LK("Wikipedia — Boeing 737 Next Generation",W_+"Boeing_737_Next_Generation")]},
 lfair:{t:"Flight load factor",l:[LK("Wikipedia — Passenger load factor",W_+"Passenger_load_factor")]},
 burn:{t:"Cruise fuel burn",d:"Fuel per kilometre flown at cruise for a 180-seat narrow-body. No official per-km cruise figure was found; 2.7 kg/km is an estimate that, with the take-off and landing fuel, reproduces the 3.1 kg/km published for an A320 averaged over a 1,850 km sector.",l:[LK("Wikipedia — Fuel economy in aircraft",W_+"Fuel_economy_in_aircraft"),LK("Wikipedia — Airbus A320 family",W_+"Airbus_A320_family")]},
 lto:{t:"Take-off and landing fuel",d:"Fuel for the landing and take-off cycle below 3,000 ft: taxi, take-off, initial climb and approach. The IPCC inventory guidance gives 810 kg for an A320 and 850 kg for the average domestic fleet. The whole distance is then charged at the cruise rate. It is the reason short flights emit more per kilometre than long ones.",l:[LK("Wikipedia — Fuel economy in aircraft",W_+"Fuel_economy_in_aircraft"),LK("Wikipedia — Environmental impact of aviation",W_+"Environmental_impact_of_aviation"),LK("IPCC — Good Practice Guidance, aircraft emissions (LTO fuel by type)","https://www.ipcc-nggip.iges.or.jp/public/gp/bgp/2_5_Aircraft.pdf")]},
 route:{t:"Routing factor",d:"Distance actually flown divided by the great-circle distance: departure and arrival procedures, airways and holding.",l:[LK("Wikipedia — Great-circle distance",W_+"Great-circle_distance"),LK("Wikipedia — Airway (aviation)",W_+"Airway_(aviation)")]},
 wtt:{t:"Fuel life-cycle multiplier",d:"Adds the emissions of extracting, refining and transporting jet fuel to the CO₂ from burning it. 1.0 counts combustion only.",l:[LK("Wikipedia — Jet fuel",W_+"Jet_fuel"),LK("Wikipedia — Life-cycle assessment",W_+"Life-cycle_assessment"),LK("Wikipedia — Environmental impact of aviation",W_+"Environmental_impact_of_aviation")]},
 rfi:{t:"Non-CO₂ warming multiplier",d:"Contrails and nitrogen oxides at altitude warm the climate in addition to CO₂. Estimates of the total effect range from 1.7 to 3 times the CO₂ alone for average flights, but a 90-minute hop spends little time at contrail-forming altitude. 1.0 ignores it.",l:[LK("Wikipedia — Environmental impact of aviation",W_+"Environmental_impact_of_aviation"),LK("Wikipedia — Contrail",W_+"Contrail"),LK("Wikipedia — Radiative forcing",W_+"Radiative_forcing")]},
 offset:{t:"Carbon offsets",d:"Both the railway and the airline buy credits for the chosen share of each passenger's emissions and add the cost to the ticket. Only share × integrity is taken off the reported emissions.",l:[LK("Wikipedia — Carbon offsets and credits",W_+"Carbon_offsets_and_credits"),LK("Wikipedia — Net-zero emissions",W_+"Net-zero_emissions"),LK("Wikipedia — Carbon tax",W_+"Carbon_tax"),LK("Wikipedia — Indonesia Stock Exchange (IDXCarbon)",W_+"Indonesia_Stock_Exchange")]},
 oprice:{t:"Offset credit price",d:"Voluntary-market avoidance credits trade at a few dollars per tonne, nature-based removal at US$15–30, and durable engineered removal at US$100–600. Indonesia's carbon tax, legislated in 2021 at a minimum of Rp 30 per kg (under US$2 per tonne), has been postponed repeatedly.",l:[LK("Wikipedia — Carbon offsets and credits",W_+"Carbon_offsets_and_credits"),LK("Wikipedia — Carbon dioxide removal",W_+"Carbon_dioxide_removal"),LK("Wikipedia — Direct air capture",W_+"Direct_air_capture"),LK("Wikipedia — Carbon tax",W_+"Carbon_tax")]},
 oqual:{t:"Credit integrity",d:"Tonnes actually kept out of the atmosphere per tonne bought, after additionality, leakage and reversal. Audits of forest-protection credits found that most delivered a fraction of what was claimed.",l:[LK("Wikipedia — Carbon offsets and credits",W_+"Carbon_offsets_and_credits"),LK("Wikipedia — Additionality",W_+"Additionality"),LK("Wikipedia — REDD+",W_+"REDD%2B")]},
 sec_d2d:{t:"Door-to-door time",d:"What the traveller experiences: getting to the terminal, waiting, the ride, and getting from the terminal to the destination. Flights are fast in the air but lose time at both ends.",l:[HSR,LK("Wikipedia — Airport check-in",W_+"Airport_check-in"),LK("Wikipedia — Value of time",W_+"Value_of_time")]},
 sec_gc:{t:"Generalised cost",d:"Fare plus offset surcharge plus the money value of door-to-door time. The traveller's verdict compares this number for the train and the flight; within ±10 % is called a toss-up.",l:[LK("Wikipedia — Generalised cost",W_+"Generalised_cost"),LK("Wikipedia — Value of time",W_+"Value_of_time"),LK("Wikipedia — Mode choice",W_+"Mode_choice")]},
 sec_co2:{t:"CO₂ per passenger",get d(){return "Train: electricity for traction and on-board systems times the grid factor, plus a share of the carbon emitted to build the line and the trainsets. Flight: fuel burned times 3.16 kg CO₂ per kg, plus fuel production and, optionally, non-CO₂ effects, plus a share of building the aircraft and the two airports. The line dominates the train's built share because it is "+fmtNum(M?M.L:B_KM+RT.extKm,0)+" km of structure, "+fmtNum(B_KM,0)+" km of it already built, used by a few million passengers a year; an airport is a few square kilometres shared by tens of millions.";},l:[LK("Wikipedia — Environmental impact of aviation",W_+"Environmental_impact_of_aviation"),LK("Wikipedia — Environmental design in rail transportation",W_+"Environmental_design_in_rail_transportation"),LK("Wikipedia — Energy efficiency in transport",W_+"Energy_efficiency_in_transport"),N_FUXING,N_JCM]},
 sec_patterns:{t:"Every stopping pattern",d:"The optional stops can be combined in thousands of ways, so each number of stops is drawn as one bar, from its fastest to its slowest pattern, placed by Jakarta–Surabaya time and fare. The highlighted dot is the current choice. Lines mark the flight fare and the train time at which both modes take equally long door to door.",l:[LK("Wikipedia — Skip-stop",W_+"Skip-stop"),LK("Wikipedia — Limited-stop",W_+"Limited-stop"),HSR]},
 sec_sens:{t:"Travel time against line speed",d:"The current stopping pattern re-run at line speeds from 200 to 400 km/h. The orange line is the in-train time at which rail and air tie door to door.",l:[HSR,LK("Wikipedia — List of high-speed railway lines",W_+"List_of_high-speed_railway_lines"),LK("Wikipedia — Fuxing (train)",W_+"Fuxing_(train)")]},
 sec_econ:{t:"Economics of the extension",d:"Only the new Bandung–Surabaya section is costed; the first line is treated as already built. Revenue is the extension's distance share of the fares collected. Construction cost is turned into a level annual payment over the asset life at the cost of capital.",l:[LK("Wikipedia — Capital recovery factor",W_+"Capital_recovery_factor"),LK("Wikipedia — Farebox recovery ratio",W_+"Farebox_recovery_ratio"),LK("Wikipedia — Kereta Cepat Indonesia China",W_+"Kereta_Cepat_Indonesia_China"),LK("Wikipedia — Danantara",W_+"Danantara"),N_SCMP,N_TEMPO]},
 sec_peers:{t:"Comparable high-speed lines",d:"City pairs of roughly the same length as Jakarta–Surabaya on which high-speed trains run today. Distances are route lengths of the high-speed line; for Japan the real length is used, not the longer fare distance. Times are the fastest scheduled train reported in the sources, which usually makes few stops; a typical train is 10 to 30 minutes slower. Rail share is rail ÷ (rail + air) passengers for the year shown; the figures come from operators, regulators and press reports and are not measured the same way, so read them to the nearest ten points. Berlin–Munich (46 % rail, 30 % air, 24 % road in 2018) and Rome–Milan (67 % rail, 21 % air in 2017–18) were published as shares of all travel and are converted here to rail ÷ (rail + air). Tokyo–Hiroshima and Tokyo–Fukuoka are from JR West's fact sheet. Top speed is the highest in service on any part of the route: Rome–Milan runs at 250 km/h south of Florence, Tokyo–Shin-Aomori at 260 km/h north of Morioka, Tokyo–Hiroshima at 285 km/h east of Osaka. Wuhan–Guangzhou returned to 350 km/h in June 2024; its time is the first reported 350 km/h run. Berlin–Munich's 3 h 55 is the 2017 Sprinter; regular trains take about four hours on a route that mixes new 300 km/h line with upgraded track.",l:[HSR,LK("Wikipedia — List of high-speed railway lines",W_+"List_of_high-speed_railway_lines"),LK("Hot Rails — Rail's market share against air, a global review of 132 city pairs","https://hotrails.net/2024/04/rails-market-share-against-air-a-global-review/"),LK("Transport Geography — Passenger rail market share against air for inter-city travel","https://transportgeography.org/contents/chapter5/rail-transportation-pipelines/passenger-rail-market-share-against-air-inter-city/"),LK("National Academies — mode share before and after high-speed rail (Paris–Marseille, Madrid–Barcelona)","https://www.nap.edu/read/22173/chapter/5"),LK("Ara — Madrid–Barcelona: 81.5 % chose the train over the plane in 2024","https://en.ara.cat/economy/high-speed-trains-between-barcelona-and-madrid-have-become-35-cheaper-since_1_5468261.html"),LK("Railway Gazette — Rome–Milan: rail 67 %, air 21 % by 2017–18","https://railwaygazette.com/high-speed/high-speed-rail-wins-market-share/55499.article"),LK("JR West fact sheet 2026 — Shinkansen share against air by city pair","https://www.westjr.co.jp/global/en/ir/library/fact-sheets/2026/pdf/fact07.pdf"),LK("L-IZ — Berlin–Munich one year on: 46 % rail, 30 % air","https://www.l-iz.de/wirtschaft/mobilitaet/2018/12/Die-Bahn-hat-ihre-Fahrgastzahlen-zwischen-Muenchen-und-Berlin-mehr-als-verdoppelt-247632"),LK("Trenitalia — Rome–Milan non-stop in 2 h 50","https://www.trenitalia.com/it/frecciarossa/collegamenti-frecciarossa/viaggia-tra-roma-e-milano-con-frecciarossa.app.html"),LK("The Paper — Wuhan–Guangzhou back to 350 km/h, June 2024","https://m.thepaper.cn/newsDetail_forward_27750324"),LK("Railway Gazette — Harbin–Dalian line opens","https://railwaygazette.com/infrastructure/harbin-dalian-pdl-opens/37552.article")]},
 sec_peercost:{t:"Construction cost of other lines",d:"Reported cost divided by route length, converted to US dollars at the exchange rate of the opening year and not adjusted for inflation. Wuhan–Guangzhou: ¥116.6 billion for 968 km. Harbin–Dalian: ¥98 billion for 921 km (other sources say ¥92–95 billion and 904 km of main line). Beijing–Shanghai: ¥220.9 billion for 1,318 km (¥217.6 billion in some accounts). China and Europe typical values are mid-points of the World Bank's 2014 ranges of US$17–21 million and US$25–39 million per km. Spain: €17.7 million per km on average, from a 2023 report by the state engineering firm Ineco. Vietnam: US$67 billion approved in 2024 for 1,541 km. Jakarta–Bandung: about US$7.3 billion for 142.3 km. California: US$126 billion for the 795 km first phase in the draft 2026 business plan, after scope cuts; the same plan puts the uncut scope at US$231 billion, so treat it as an order of magnitude. Terrain, land prices and the share of viaduct and tunnel explain most of the spread.",l:[LK("Wikipedia — Wuhan–Guangzhou high-speed railway",W_+"Wuhan–Guangzhou_high-speed_railway"),LK("Wikipedia — Beijing–Shanghai high-speed railway",W_+"Beijing–Shanghai_high-speed_railway"),LK("Wikipedia — North–South express railway (Vietnam)",W_+"North–South_express_railway"),LK("Wikipedia — California High-Speed Rail",W_+"California_High-Speed_Rail"),LK("Wikipedia — High-speed rail in Spain",W_+"High-speed_rail_in_Spain"),WHOOSH,LK("Construction Management — why China can build high-speed rail so cheaply (World Bank figures)","https://constructionmanagement.co.uk/why-china-can-build-high-speed-rail-so-cheaply/"),LK("Transit Costs Project — high-speed rail data","https://transitcosts.com/?p=10499"),LK("Global Railway Review — Ineco: Spanish high-speed rail at €17.7 million per km","https://www.globalrailwayreview.com/news/147158/spanish-high-speed-rail/"),LK("California Senate — Legislative Analyst review of the draft 2026 business plan","https://stran.senate.ca.gov/media/1335"),LK("Railway Gazette — Vietnam high-speed rail plan approved","https://www.railwaygazette.com/high-speed/vietnam-high-speed-rail-plan-approved/68014.article"),LK("China Daily — Harbin–Dalian, 98 billion yuan","https://covid-19.chinadaily.com.cn/business/2012CEWC/2012-12/01/content_16012522.htm")]},
 r_share:{t:"Rail share of the rail + air market",d:"Rule of thumb from Europe and Japan: rail takes most of the combined market when the train ride is under about three hours and little above five. Modeled as a logistic curve centred on 3.9 hours. Price is not included, except that a flight surcharge is also shown as the travel time it is worth to the traveller. The chart further down plots real corridors against this curve.",l:[HSR,LK("Wikipedia — Modal share",W_+"Modal_share"),LK("Wikipedia — Tokaido Shinkansen",W_+"Tokaido_Shinkansen"),LK("Wikipedia — Madrid–Barcelona high-speed rail line",W_+"Madrid%E2%80%93Barcelona_high-speed_rail_line")]},
 r_flightdist:{t:"Flight distance",d:"Great circle between airport reference points: Halim–Juanda and Soekarno–Hatta–Juanda.",l:[LK("Wikipedia — Soekarno–Hatta International Airport",W_+"Soekarno–Hatta_International_Airport"),LK("Wikipedia — Great-circle distance",W_+"Great-circle_distance"),LK("Wikipedia — Haversine formula",W_+"Haversine_formula"),LK("Wikipedia — Halim Perdanakusuma International Airport",W_+"Halim_Perdanakusuma_International_Airport"),LK("Wikipedia — Juanda International Airport",W_+"Juanda_International_Airport")]},
 r_resist:{t:"Running resistance",get d(){const [k,w]=cruise350();return "Davis equation: resistance per unit of train weight = a + b·V + c·V². The coefficients are chosen so that steady running at 350 km/h draws about "+fmtNum(k,0)+" kWh per km at the overhead line, about "+fmtNum(w,0)+" Wh per seat-km, with the default mass and drivetrain efficiency and before auxiliaries. Two published figures bracket it: a 2017 press figure of 3.8 kWh per 100 passenger-km for the Fuxing at 350 km/h, and 17.3 kWh per train-km over a whole duty cycle in the product declaration of the CR400AF-Z, a sister of the KCIC400AF.";},l:[N_FUXING,LK("Wikipedia — Rolling resistance",W_+"Rolling_resistance"),LK("Wikipedia — Drag (physics)",W_+"Drag_(physics)"),LK("Wikipedia — Fuxing (train)",W_+"Fuxing_(train)")]},
 r_bench:{t:"Fare benchmarks",d:"For scale: Beijing–Shanghai, 1,318 km, costs ¥498–662 in second class; Tokyo–Shin-Osaka, 515 km, ¥14,720 reserved on a Nozomi. The conventional Argo Bromo Anggrek covers Jakarta–Surabaya in 7 h 45 min.",l:[LK("Wikipedia — Beijing–Shanghai high-speed railway",W_+"Beijing%E2%80%93Shanghai_high-speed_railway"),LK("Wikipedia — Tokaido Shinkansen",W_+"Tokaido_Shinkansen"),LK("Wikipedia — Anggrek (train)",W_+"Anggrek_(train)"),LK("Wikipedia — Jakarta–Surabaya line",W_+"Jakarta%E2%80%93Surabaya_line")]},
 r_verdictT:{t:"Traveller's verdict",d:"Compares generalised cost: fare, offset surcharge and the value of door-to-door time. The flight side is the average of the Halim and Soekarno–Hatta flights, weighted by each airport's share of flights; the comparison table shows each airport on its own. Train wins below 90 % of the flight's cost, flight wins above 110 %, anything between is a toss-up.",l:[LK("Wikipedia — Generalised cost",W_+"Generalised_cost"),LK("Wikipedia — Value of time",W_+"Value_of_time"),HSR]},
 r_verdictI:{t:"Investor's verdict",d:"Does the extension's fare revenue cover its operating cost and the annual payment on its construction cost? Coverage of 100 % or more pays for itself; an operating surplus that covers only part of the capital needs public money; revenue below operating cost loses money on every train.",l:[LK("Wikipedia — Farebox recovery ratio",W_+"Farebox_recovery_ratio"),LK("Wikipedia — Capital recovery factor",W_+"Capital_recovery_factor"),N_SCMP]},
 r_verdictP:{t:"Planet's verdict",d:"Compares CO₂e per passenger after offsets, including a share of construction carbon for the train. Within ±15 % is no clear winner.",l:[LK("Wikipedia — Environmental impact of aviation",W_+"Environmental_impact_of_aviation"),LK("Wikipedia — Life-cycle assessment",W_+"Life-cycle_assessment"),N_JCM]},
};
// Inputs that share an explanation with their counterpart at the other end of the trip, or with their switch.
REFS.fegr=REFS.facc; REFS.tegr=REFS.tacc; REFS.oshare=REFS.offset;
function refBtn(id){return REFS[id]?`<button class="ref" data-ref="${id}" title="What this is &amp; references" aria-label="What this is and references">i</button>`:"";}
function openRefs(id){const r=REFS[id];if(!r)return;
  document.getElementById("mtitle").textContent=r.t;
  const d=document.getElementById("mdesc");d.textContent=r.d||"";d.style.display=r.d?"":"none";
  document.getElementById("mlist").innerHTML=r.l.map(([t,u])=>`<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a><div class="u">${esc(decodeURI(u))}</div></li>`).join("");
  document.getElementById("modal").style.display="flex";}
function closeRefs(){document.getElementById("modal").style.display="none";}

// ---------- icons ----------
const ICONS={
 route:'<circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="6" r="2.5"/><path d="M7.5 18H14a3.5 3.5 0 0 0 0-7h-4a3.5 3.5 0 0 1 0-7h6.5"/>',
 train:'<rect x="5" y="3" width="14" height="14" rx="4"/><path d="M5 11h14M9 21l2-4M15 21l-2-4"/><circle cx="9" cy="14" r=".8" fill="currentColor"/><circle cx="15" cy="14" r=".8" fill="currentColor"/>',
 fare:'<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/>',
 plane:'<path d="M10 3.5c0-1 2-1 2 0V9l8 5v2l-8-2.5V18l2.5 2v1.5L11 20l-3.5 1.5V20L10 18v-4.5L2 16v-2l8-5z"/>',
 door:'<path d="M5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M3 21h18M19 21V8"/><circle cx="12.5" cy="12" r=".9" fill="currentColor"/>',
 environment:'<path d="M4 20C4 9 10 5 20 4c-1 10-5 16-16 16z"/><path d="M4 20c4-6 8-9 12-12"/>',
 economics:'<circle cx="12" cy="12" r="9"/><path d="M12 6v12M15 9a3 2 0 0 0-3-1.5c-2 0-3 1-3 2s1 2 3 2 3 1 3 2-1 2-3 2a3 2 0 0 1-3-1.5"/>',
 chart:'<path d="M4 20V4M4 20h16"/><path d="M8 16v-6M12 16V8M16 16v-3M20 16V6"/>',
 notes:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 map:'<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
 energy:'<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
};
function ico(name){return ICONS[name]?`<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`:"";}
const glyph=name=>`<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
const GROUP_ICON={"Route & train":"train","Fares":"fare","Flights to SUB":"plane","Door to door":"door","Economics":"economics","Energy & environment":"environment"};

// ---------- inputs ----------
const P0=v=>pct(v,0), MIN=v=>v+" min";
const CTLS=[
 {g:"Route & train",id:"alignf",min:0.8,max:1.1,step:0.01,def:1,fmt:v=>v.toFixed(2)+"×",
  get label(){return RT.kind==="kcic"?"Extension length vs the published length":"Extension length vs the estimate";},
  get note(){return RT.kind==="kcic"?"KCIC's study gives "+fmtNum(RT.extKm,2)+" km from Tegalluar to Surabaya for this alternative; 1.00× keeps that length."
    :"Estimated at "+fmtNum(RT.extKm,0)+" km: the length as drawn plus "+pct(RT.stretch-1)+", the stretch that fits KCIC's three published lengths on average.";}},
 {g:"Route & train",id:"vmax",label:"Line speed",min:200,max:400,step:10,def:350,fmt:v=>v+" km/h",note:"Whoosh runs at 350 km/h. Most European and Japanese lines run at 300–320."},
 {g:"Route & train",id:"vurb",min:80,max:350,step:10,def:200,fmt:v=>v+" km/h",
  get label(){return RT.skipsBandung?"Speed limit within 8 km of Jakarta and Surabaya":"Speed limit within 8 km of Jakarta, Bandung, Surabaya";},
  get note(){return RT.skipsBandung?"City approaches have tighter curves.":"City approaches have tighter curves. Applies on both sides of Bandung, where every train stops anyway.";}},
 {g:"Route & train",id:"pwr",label:"Traction power at the wheels",min:6,max:14,step:0.25,def:9.75,fmt:v=>v.toFixed(2)+" MW",note:"CR400AF, the parent design of Whoosh's KCIC400AF: 9.75 MW for 8 cars."},
 {g:"Route & train",id:"mass",label:"Train mass, loaded",min:400,max:600,step:10,def:500,fmt:v=>v+" t",note:"8-car set with "+SEATS+" seats."},
 {g:"Route & train",id:"acc",label:"Starting acceleration",min:0.3,max:1,step:0.05,def:0.5,fmt:v=>v.toFixed(2)+" m/s²",note:"Holds until traction power becomes the limit, at about "+"70–100 km/h."},
 {g:"Route & train",id:"dec",label:"Service braking",min:0.3,max:1,step:0.05,def:0.5,fmt:v=>v.toFixed(2)+" m/s²",note:"Comfortable timetable braking, well below emergency rates."},
 {g:"Route & train",id:"grade",type:"toggle",label:"Include gradients from the elevation profile",def:1,fmt:v=>v?"on":"off",note:"Gravity along the modeled rail level. Off = level track."},
 {g:"Route & train",id:"dwell",label:"Dwell time per intermediate stop",min:1,max:10,step:0.5,def:2,fmt:v=>v+" min"},
 {g:"Route & train",id:"pad",label:"Timetable margin over fastest run",min:0,max:0.25,step:0.01,def:0.1,fmt:P0,note:"Recovery time built into timetables. Typical 5–10 %; Whoosh's own timetable is more generous."},

 {g:"Fares",id:"fjb",label:"Jakarta–Bandung fare today",min:150000,max:450000,step:5000,def:300000,fmt:v=>fmtRp(v),note:"Premium Economy, Halim–Tegalluar. Dynamic tiers from Rp 150,000 to Rp 250,000; the 2023 list price was Rp 300,000."},
 {g:"Fares",id:"beta",label:"Distance taper β (fare ∝ distance^β)",min:0.6,max:1,step:0.01,def:0.9,fmt:v=>v.toFixed(2),note:"1.00 = flat price per km, as in China. KCIC's own Karawang fare implies 0.35–0.55, a much steeper taper."},
 {g:"Fares",id:"st",label:"Share of the fare that scales with travel time",min:0,max:0.5,step:0.01,def:0.25,fmt:P0,note:"Trainsets and crews. Slower trains make fewer trips per day, so stops raise this part."},
 {g:"Fares",id:"ss",label:"Share of the fare that scales with stations served",min:0,max:0.3,step:0.01,def:0.1,fmt:P0,note:"Station building and staffing. The rest of the fare scales with distance."},
 {g:"Fares",id:"fx",label:"Exchange rate",min:14000,max:22000,step:100,def:18200,fmt:v=>"Rp "+fmtNum(v,0)+" / US$",note:"About Rp 18,170 per US$ on 12 November 2026."},

 {g:"Flights to SUB",id:"cgkshare",label:"Share of flights leaving from CGK",min:0,max:1,step:0.05,def:0.75,fmt:P0,note:"Weights the average flight. Schedules list roughly 28–31 daily flights from Soekarno–Hatta against 9–10 from Halim; 0% compares against Halim only, 100% against Soekarno–Hatta only."},
 {g:"Flights to SUB",id:"ffare",label:"HLP–SUB fare, one way, all-in",min:400000,max:2500000,step:25000,def:1000000,fmt:v=>fmtRp(v),note:"Regulated economy range for Jakarta–Surabaya: Rp 408,000 to Rp 1,167,000 before tax and airport charge. Booking sites in 2026 show monthly averages of Rp 740,000–1,110,000, with Garuda near Rp 1.3 million at peak."},
 {g:"Flights to SUB",id:"cfare",label:"CGK–SUB fare, one way, all-in",min:400000,max:2500000,step:25000,def:1000000,fmt:v=>fmtRp(v),note:"Same regulated band and the same default: Citilink prices the two airports about the same."},
 {g:"Flights to SUB",id:"fsur",label:"Government surcharge on each flight ticket",min:0,max:3000000,step:25000,def:0,fmt:v=>v?fmtRp(v):"none",note:"A levy on every Jakarta–Surabaya air ticket, on top of the airline's fare, to push travellers to the train and leave flying as the premium option."},
 {g:"Flights to SUB",id:"fblock",label:"HLP–SUB block time, gate to gate",min:65,max:130,step:5,def:90,fmt:MIN,note:"Batik Air schedules 1 h 25, Citilink 1 h 30."},
 {g:"Flights to SUB",id:"cblock",label:"CGK–SUB block time, gate to gate",min:65,max:130,step:5,def:100,fmt:MIN,note:"Citilink schedules 1 h 40; about 30 km farther and a longer taxi at a much larger airport."},
 {g:"Flights to SUB",id:"fpre",label:"At the airport before departure",min:30,max:150,step:5,def:60,fmt:MIN,note:"Check-in, security and boarding. Used for both airports."},
 {g:"Flights to SUB",id:"fpost",label:"Leaving the aircraft and terminal",min:5,max:60,step:5,def:20,fmt:MIN,note:"Add time here if you check a bag."},

 {g:"Door to door",id:"facc",label:"Origin → Halim airport (HLP)",min:10,max:120,step:5,def:45,fmt:MIN,note:"About 20 km by road from Monas."},
 {g:"Door to door",id:"cacc",label:"Origin → Soekarno–Hatta airport (CGK)",min:10,max:180,step:5,def:60,fmt:MIN,note:"About 26 km by road from Monas, in Tangerang; the airport train from BNI City takes 40 minutes plus getting to it."},
 {g:"Door to door",id:"fegr",label:"Juanda airport → destination",min:10,max:120,step:5,def:40,fmt:MIN,note:"Juanda is about 22 km by road from central Surabaya."},
 {g:"Door to door",id:"tacc",label:"Origin → Halim station",min:10,max:120,step:5,def:45,fmt:MIN,note:"The station is about 7 km by road from the airport terminal and on the LRT."},
 {g:"Door to door",id:"tpre",label:"At the station before departure",min:5,max:60,step:5,def:20,fmt:MIN},
 {g:"Door to door",id:"tegr",label:"Surabaya station → destination",min:10,max:120,step:5,def:35,fmt:MIN,
  get note(){return RT.terminus==="pasarturi"?"This route ends at Pasar Turi, in the city centre. The default suits a terminus at Waru, about 18 km out by road.":"The modeled terminus at Waru is about 18 km by road from the city centre.";}},
 {g:"Door to door",id:"vot",label:"Value of the traveller's time",min:0,max:500000,step:10000,def:100000,fmt:v=>fmtRp(v)+" / h",note:"Turns minutes into rupiah for the verdict. 0 = only the price matters."},

 {g:"Economics",id:"capex",label:"Construction cost of the extension",min:10,max:70,step:1,def:30,fmt:v=>"US$"+v+" M / km",note:"The first Whoosh line: about US$51 M/km. Chinese domestic lines: US$17–21 M/km."},
 {g:"Economics",id:"trains",label:"Trains per day, each direction",min:6,max:60,step:1,def:24,fmt:v=>v+" trains",note:"Whoosh runs 20–31 each way per day."},
 {g:"Economics",id:"lf",label:"Train load factor",min:0.2,max:1,step:0.01,def:0.65,fmt:P0,note:"Share of seat-km sold along the whole line."},
 {g:"Economics",id:"opex_train",label:"Train operating cost, excl. energy",min:3,max:40,step:1,def:12,fmt:v=>"US$"+v+" / train-km",note:"Crew, maintenance and the capital cost of trainsets."},
 {g:"Economics",id:"opex_infra",label:"Infrastructure maintenance",min:30,max:300,step:10,def:120,fmt:v=>"US$"+v+"k / km / yr"},
 {g:"Economics",id:"elec",label:"Electricity price",min:700,max:2000,step:25,def:1100,fmt:v=>"Rp "+fmtNum(v,0)+" / kWh",note:"PLN industrial tariffs: Rp 997 per kWh at high voltage (I-4), Rp 1,115 at medium voltage (I-3)."},
 {g:"Economics",id:"wacc",label:"Cost of capital",min:0,max:0.12,step:0.0025,def:0.05,fmt:v=>pct(v,2),note:"China Development Bank lent for the first line at 2 % and 3.4 %. Government bonds yield 6–7.7 % (7.5 % in Nov 2026)."},
 {g:"Economics",id:"life",label:"Asset life",min:20,max:80,step:5,def:40,fmt:v=>v+" yr",note:"Years over which the construction cost is repaid."},

 {g:"Energy & environment",id:"grid",label:"Grid carbon intensity",min:0,max:1000,step:10,def:800,fmt:v=>v+" gCO₂/kWh",note:"Java–Madura–Bali: about 800, with published factors from 530 to 870. Indonesia as a whole ≈ 680. World average ≈ 465."},
 {g:"Energy & environment",id:"eta",label:"Drivetrain efficiency, wire to wheel",min:0.75,max:0.95,step:0.01,def:0.85,fmt:P0},
 {g:"Energy & environment",id:"regen",label:"Braking energy recovered",min:0,max:0.9,step:0.05,def:0.6,fmt:P0,note:"Regenerative braking feeding other trains or the grid."},
 {g:"Energy & environment",id:"aux",label:"Auxiliary power (air conditioning, lighting)",min:200,max:1200,step:50,def:600,fmt:v=>v+" kW"},
 {g:"Energy & environment",id:"infraco2",label:"Construction carbon of the line",min:3000,max:40000,step:1000,def:15000,fmt:v=>fmtNum(v,0)+" tCO₂ / km",note:"Embankment ≈ 6,000; mostly viaduct and tunnel ≈ 30,000."},
 {g:"Energy & environment",id:"clife",label:"Years the construction carbon is spread over",min:30,max:100,step:5,def:60,fmt:v=>v+" yr",note:"Earthworks and viaducts last 60–100 years; track and systems are renewed sooner."},
 {g:"Energy & environment",id:"trainco2",label:"Carbon to build one trainset",min:0,max:8000,step:250,def:3500,fmt:v=>fmtNum(v,0)+" tCO₂",note:"About 450 t of train at roughly 8 kg CO₂ per kg. Spread over "+TRAIN_LIFE_YR+" years and the fleet the timetable needs."},
 {g:"Energy & environment",id:"planeco2",label:"Carbon to build one aircraft",min:0,max:5000,step:100,def:1500,fmt:v=>fmtNum(v,0)+" tCO₂",note:"About 43 t of A320 at roughly 35 kg CO₂ per kg of aerospace metal and composite. Spread over "+fmtNum(AIRCRAFT_CYCLES,0)+" flights."},
 {g:"Energy & environment",id:"apco2",label:"Airport construction carbon per passenger, both ends",min:0,max:5,step:0.1,def:1,fmt:v=>v.toFixed(1)+" kg",note:"Runways and terminals spread over 60 years of passengers. Set to 0 to treat the existing airports as already paid for."},
 {g:"Energy & environment",id:"divert",label:"Share of riders who would otherwise fly",min:0.05,max:1,step:0.05,def:0.4,fmt:P0,note:"Used only for the carbon payback of construction."},
 {g:"Energy & environment",id:"seatsair",label:"Aircraft seats",min:120,max:220,step:2,def:180,fmt:v=>v+" seats",note:"Airbus A320 in all-economy layout: 180."},
 {g:"Energy & environment",id:"lfair",label:"Flight load factor",min:0.5,max:1,step:0.01,def:0.8,fmt:P0},
 {g:"Energy & environment",id:"burn",label:"Cruise fuel burn",min:2,max:4,step:0.05,def:2.7,fmt:v=>v.toFixed(2)+" kg / km",note:"A320-class at cruise."},
 {g:"Energy & environment",id:"lto",label:"Fuel for the take-off and landing cycle",min:300,max:1500,step:50,def:850,fmt:v=>v+" kg",note:"IPCC: 810 kg for an A320, 850 kg fleet average, below 3,000 ft."},
 {g:"Energy & environment",id:"route",label:"Routing factor over great circle",min:1,max:1.25,step:0.01,def:1.08,fmt:v=>v.toFixed(2)+"×"},
 {g:"Energy & environment",id:"wtt",label:"Jet fuel life-cycle multiplier",min:1,max:1.4,step:0.01,def:1.2,fmt:v=>v.toFixed(2)+"×",note:"Adds fuel production to combustion. 1.00 = tailpipe only."},
 {g:"Energy & environment",id:"rfi",label:"Non-CO₂ warming multiplier",min:1,max:3,step:0.1,def:1,fmt:v=>v.toFixed(1)+"×",note:"Contrails and NOx at altitude. 1.0 = ignore; 1.7–3 are used for average flights."},
 {g:"Energy & environment",id:"offset",type:"toggle",label:"Offset emissions with carbon credits",def:0,fmt:v=>v?"on":"off",note:"Applies to both the train and the flight. The cost is added to each ticket."},
 {g:"Energy & environment",id:"oshare",dep:"offset",label:"Share of emissions covered",min:0,max:1,step:0.05,def:1,fmt:P0},
 {g:"Energy & environment",id:"oprice",dep:"offset",label:"Credit price",min:Math.log10(2),max:Math.log10(600),step:0.01,def:1,log:true,snap:v=>+v.toPrecision(2),fmt:v=>"US$"+fmtNum(v,0)+" / tCO₂",note:"≈ US$5–10: voluntary market. US$15–30: nature-based removal. US$100–600: durable engineered removal."},
 {g:"Energy & environment",id:"oqual",dep:"offset",label:"Credit integrity (tonnes really removed per tonne bought)",min:0,max:1,step:0.05,def:0.5,fmt:P0,note:"Cheap avoidance credits 0.1–0.4; nature-based removal 0.6–0.9; durable removal ≈ 1."},
];
const CTL=Object.fromEntries(CTLS.map(c=>[c.id,c]));
const PRESETS=[
 {name:"Baseline — limited stops",note:"The route's main cities served, 350 km/h, today's fares and today's grid.",stops:"def",set:{}},
 {name:"Express — mandatory stops only",note:"Only the stops every train makes. The fastest the line can do.",stops:"none",set:{}},
 {name:"All stops",note:"Every station on the route.",stops:"all",set:{}},
 {name:"Optimist — the pitch",note:"A straighter and cheaper line, full trains, tight timetable, flights at peak fares.",stops:"key",set:{alignf:0.9,capex:20,lf:0.8,trains:30,pad:0.05,ffare:1400000,cfare:1400000,wacc:0.03,tegr:25}},
 {name:"Sceptic — Whoosh costs repeat",note:"Construction at the first line's cost per km, 300 km/h, half-empty trains, cheap flights.",stops:"all",set:{capex:51,lf:0.45,vmax:300,pad:0.15,ffare:900000,cfare:800000,wacc:0.07}},
 {name:"Clean grid",note:"Baseline on a grid at 100 gCO₂/kWh, as a net-zero power system would deliver.",stops:"def",set:{grid:100}},
 {name:"Offsets on, cheap credits",note:"Both modes buy voluntary-market credits for all their emissions.",stops:"def",set:{offset:1,oprice:Math.log10(8),oqual:0.3}},
 {name:"Offsets on, durable removal",note:"Both modes pay for engineered removal at US$300 per tonne.",stops:"def",set:{offset:1,oprice:Math.log10(300),oqual:1}}, {name:"Flight surcharge — flying as a premium",note:"Baseline plus a levy of Rp 1,000,000 on every Jakarta–Surabaya air ticket, which doubles what the flight costs.",stops:"def",set:{fsur:1000000}},
];
const presetStops=p=>p.stops==="all"?ALL:p.stops==="none"?[]:p.stops==="key"?[RT.key]:DEFAULT_STOPS;
const state={}, stops=new Set(DEFAULT_STOPS);
function ctlVal(c){const el=document.getElementById("in_"+c.id);if(c.type==="toggle")return el.checked?1:0;const raw=parseFloat(el.value);const v=c.log?Math.pow(10,raw):raw;return c.snap?c.snap(v):v;}
function setCtl(c,raw){const el=document.getElementById("in_"+c.id);if(c.type==="toggle")el.checked=!!+raw;else el.value=raw;}
function buildControls(){
  const aside=document.getElementById("controls");
  [...new Set(CTLS.map(c=>c.g))].forEach((g,gi)=>{
    const d=document.createElement("details");d.open=gi<1;
    d.innerHTML=`<summary><span>${ico(GROUP_ICON[g])}${g}</span></summary><div class="body"></div>`;
    const body=d.querySelector(".body");
    CTLS.filter(c=>c.g===g).forEach(c=>{
      const w=document.createElement("div");w.className="ctl";w.id="ctl_"+c.id;
      w.innerHTML=c.type==="toggle"
        ?`<label class="switch"><input type="checkbox" id="in_${c.id}"><span>${c.label}</span>${refBtn(c.id)}</label><output id="out_${c.id}" style="display:none"></output>${c.note?`<div class="note">${c.note}</div>`:""}`
        :`<div class="row"><label for="in_${c.id}"><span id="lab_${c.id}">${c.label}</span>${refBtn(c.id)}</label><output id="out_${c.id}"></output></div>
        <input type="range" id="in_${c.id}" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.def}">
        ${c.note?`<div class="note" id="note_${c.id}">${c.note}</div>`:""}`;
      body.appendChild(w);
      w.querySelector("input").addEventListener("input",()=>{markCustom();update();});
    });
    aside.appendChild(d);
  });
  const sel=document.getElementById("preset");
  sel.innerHTML=PRESETS.map((p,i)=>`<option value="${i}">${p.name}</option>`).join("")+`<option value="custom" hidden>Custom</option>`;
  sel.addEventListener("change",()=>{if(sel.value!=="custom")applyPreset(+sel.value);});
  document.getElementById("routeList").innerHTML=ROUTES.map((r,i)=>(i&&ROUTES[i-1].kind===r.kind?"":`<div class="rgroup">${ROUTE_GROUP[r.kind]}</div>`)+
    `<label class="route"><input type="radio" name="route" value="${r.id}"><span><b>${routeTitle(r)}</b><small>via ${r.via} · ${extKmText(r)} · ${r.nStations} stations${r.nReserve?" + "+r.nReserve+" reserve":""}${r.pub?" · "+r.pub.min+" min":""}${r.skipsBandung?" · skips Bandung":""}</small></span></label>`).join("");
  document.querySelectorAll("#routeList input").forEach(el=>el.addEventListener("change",()=>{if(el.checked)setRoute(el.value);}));
  buildRouteUI();
  document.getElementById("stopsNone").onclick=()=>{stops.clear();markCustom();update();};
  document.getElementById("stopsAll").onclick=()=>{OPT.forEach(s=>stops.add(s));markCustom();update();};
  document.getElementById("resetAll").onclick=()=>{sel.value="0";useRoute(ROUTE_DEF);buildRouteUI();applyPreset(0);};
}
// Everything on the page that depends on which route is chosen but not on the sliders.
function buildRouteUI(){
  document.querySelectorAll("#routeList input").forEach(el=>{el.checked=el.value===RT.id;el.closest("label").classList.toggle("on",el.checked);});
  document.getElementById("routeNote").textContent=RT.kind==="kcic"?"stations from the study's map":"not in either study";
  document.getElementById("stopList").innerHTML=ST.map(s=>`<label class="stop${s.must?" must":""}"><input type="checkbox" data-stop="${s.id}" ${s.must?"checked disabled":""}><span>${s.name}${s.must?'<span class="tag">always</span>':""}${s.built?"":`<span class="tag">${s.reserve?"reserve":s.inferred?"inferred":"new"}</span>`}</span><span class="km" id="km_${s.id}"></span></label>`).join("");
  document.querySelectorAll("#stopList input").forEach(el=>el.addEventListener("change",()=>{el.checked?stops.add(el.dataset.stop):stops.delete(el.dataset.stop);markCustom();update();}));
  for(const id of ["alignf","vurb","tegr"]){document.getElementById("lab_"+id).textContent=CTL[id].label;document.getElementById("note_"+id).textContent=CTL[id].note;}
  document.getElementById("patSub").textContent=fmtNum(N_PAT,0)+" combinations of optional stops, as the range for each number of stops";
  document.getElementById("notes").innerHTML=NOTES().map(n=>`<li>${n}</li>`).join("");
}
// Switch route. Stops follow the preset in force, or the new route's main cities when the scenario is a custom one.
function setRoute(id){
  if(id===RT.id)return;
  const pv=document.getElementById("preset").value,hadKarawang=stops.has("karawang");
  useRoute(id);stops.clear();
  if(pv!=="custom")presetStops(PRESETS[+pv]).forEach(x=>stops.add(x));else{DEFAULT_STOPS.forEach(x=>stops.add(x));if(hadKarawang)stops.add("karawang");}
  buildRouteUI();update();
}
function markCustom(){document.getElementById("preset").value="custom";document.getElementById("presetNote").textContent="Custom scenario.";}
function applyPreset(i){const p=PRESETS[i];CTLS.forEach(c=>setCtl(c,p.set[c.id]!==undefined?p.set[c.id]:c.def));stops.clear();presetStops(p).forEach(s=>stops.add(s));document.getElementById("presetNote").textContent=p.note;update();}
function toggleStop(id){if(!OPT.includes(id))return;stops.has(id)?stops.delete(id):stops.add(id);markCustom();update();}

// ---------- model ----------
function mkTrain(s,vmaxKmh){
  const m=s.mass*1000, meff=m*ROT, W=s.mass*G, Pw=s.pwr*1e6;
  const R=v=>{const V=v*3.6;return W*(DAVIS[0]+DAVIS[1]*V+DAVIS[2]*V*V);};          // N
  const acc=v=>Math.min(s.acc,(Pw/Math.max(v,0.5)-R(v))/meff);                      // m/s²
  return {m,meff,R,acc,a0:s.acc,Pw,mg:m*G,dec:s.dec,vmax:(vmaxKmh??s.vmax)/3.6,vurb:Math.min(s.vurb,vmaxKmh??s.vmax)/3.6};
}
// ---------- elevation ----------
// Ground ("z") or rail level ("r") in metres at a chainage of route rt, before the alignment slider is applied.
const PSTEP=ROUTE.profStepKm, GCELL=0.1;
function elevAt(rt,raw,k){const B=rt.builtKm,a=raw<=B?ROUTE.whooshProf[k]:rt.prof[k],x=Math.max(0,Math.min(a.length-1,(raw<=B?raw:raw-B)/PSTEP)),i=Math.min(a.length-2,Math.floor(x));return a[i]+(x-i)*(a[i+1]-a[i]);}
// Slope of the rail level in 100 m cells along the line, as the alignment slider lengthens or shortens it. rev: the same line run from Surabaya.
function gradeCells(rt,alignf,rev){
  const B=rt.builtKm,L=B+rt.extKm*alignf,n=Math.ceil(L/GCELL),g=new Float32Array(n),raw=x=>x<=B?x:B+(x-B)/alignf;
  for(let k=0;k<n;k++){const x0=k*GCELL,x1=Math.min(L,x0+GCELL);g[k]=x1>x0?(elevAt(rt,raw(x1),"r")-elevAt(rt,raw(x0),"r"))/((x1-x0)*1000):0;}
  if(!rev)return g;
  const h=new Float32Array(n);for(let k=0;k<n;k++)h[k]=-g[n-1-k];return h;
}
const GRADE_WHOOSH=gradeCells({builtKm:WHOOSH_KM,extKm:0},1); // today's line, for the reference service
// One run between two consecutive stops (km positions a < b). Forward pass: traction; backward pass: braking.
// grade: slope per 100 m cell (gradeCells), or null for level track. Gravity adds m·g·slope to the resistance.
function simLeg(a,b,tr,zones,keep,grade){
  const n=Math.max(2,Math.round((b-a)/DS)), h=(b-a)/n*1000, v=new Float64Array(n+1), lim=new Float64Array(n+1);
  for(let i=0;i<=n;i++){const x=a+(b-a)*i/n;lim[i]=zones.some(z=>Math.abs(x-z)<=ZONE_KM)?tr.vurb:tr.vmax;}
  const gr=grade?new Float32Array(n):null;if(gr)for(let i=0;i<n;i++)gr[i]=grade[Math.min(grade.length-1,((a+(b-a)*(i+0.5)/n)/GCELL)|0)];
  if(!gr)for(let i=0;i<n;i++)v[i+1]=Math.min(lim[i+1],Math.sqrt(Math.max(0,v[i]*v[i]+2*tr.acc(v[i])*h)));
  else for(let i=0;i<n;i++){const R=tr.R(v[i]),acc=Math.min(tr.a0,(Math.min(tr.meff*tr.a0+R,tr.Pw/Math.max(v[i],0.5))-R-tr.mg*gr[i])/tr.meff); // same pull as on the level, less the slope
    v[i+1]=Math.min(lim[i+1],Math.sqrt(Math.max(0.01,v[i]*v[i]+2*acc*h)));}
  v[n]=0;for(let i=n-1;i>0;i--){const vb=Math.sqrt(v[i+1]*v[i+1]+2*tr.dec*h);if(vb<v[i])v[i]=vb;}
  let t=0,Et=0,Er=0,vm=0;const ts=keep?new Float64Array(n+1):null;
  for(let i=0;i<n;i++){const va=(v[i]+v[i+1])/2;t+=h/va;if(ts)ts[i+1]=t;
    const F=tr.meff*(v[i+1]*v[i+1]-v[i]*v[i])/(2*h)+tr.R(va)+(gr?tr.mg*gr[i]:0);if(F>0)Et+=F*h;else Er-=F*h;if(v[i+1]>vm)vm=v[i+1];}
  return {a,b,t,Et,Er,vmax:vm,n,v:keep?v:null,lim:keep?lim:null,ts};
}
const crf=(r,n)=>r>0?r/(1-Math.pow(1+r,-n)):1/n;
function model(s,stopSet){
  const m={};
  const km=k=>k<=B_KM?k:B_KM+(k-B_KM)*s.alignf;
  m.km=km; m.ext=RT.extKm*s.alignf; m.L=B_KM+m.ext; m.zones=zonesFor(RT,m.L); m.G=s.grade?gradeCells(RT,s.alignf):null;
  m.pos=ST.map(x=>km(x.km));
  const tr=mkTrain(s); m.tr=tr;
  // leg cache: fastest run between any two stations
  const cache=new Map(), leg=(i,j,keep)=>{const k=i+"-"+j+(keep?"k":"");let r=cache.get(k);if(!r){r=simLeg(m.pos[i],m.pos[j],tr,m.zones,keep,m.G);cache.set(k,r);}return r;};
  const journey=(idx,keep)=>{let run=0,Et=0,Er=0;const legs=[];for(let k=1;k<idx.length;k++){const r=leg(idx[k-1],idx[k],keep);legs.push(r);run+=r.t;Et+=r.Et;Er+=r.Er;}
    const T=run*(1+s.pad)+s.dwell*60*(idx.length-2);return {legs,run,T,Et,Er};};
  const fare=(Lkm,Tsec,N)=>{const sd=Math.max(0,1-s.st-s.ss);const p=[sd*Math.pow(Lkm/WHOOSH_KM,s.beta),s.st*Tsec/m.Tref,s.ss*N/N_REF];return {parts:p.map(x=>x*s.fjb),total:s.fjb*(p[0]+p[1]+p[2])};};
  // reference service the fare is calibrated on: Halim – Karawang – Padalarang – Tegalluar
  { const R=ROUTE.refKm;let run=0;for(let k=1;k<R.length;k++)run+=simLeg(R[k-1],R[k],tr,[0,WHOOSH_KM],false,s.grade?GRADE_WHOOSH:null).t;m.Tref=run*(1+s.pad)+s.dwell*60*(N_REF-2); }
  // chosen pattern
  m.idx=ST.map((x,i)=>i).filter(i=>ST[i].must||stopSet.has(ST[i].id));
  const J=journey(m.idx,true); m.J=J; m.T=J.T; m.Tmin=J.T/60; m.nStops=m.idx.length;
  m.avg=m.L/(J.T/3600);
  // arrival time (s) at each served stop and fare from Jakarta
  m.arr=[0];for(let k=1;k<m.idx.length;k++)m.arr.push(m.arr[k-1]+J.legs[k-1].t*(1+s.pad)+(k>1?s.dwell*60:0));
  m.fares=m.idx.map((i,k)=>k?fare(m.pos[i],m.arr[k],k+1):{parts:[0,0,0],total:0});
  m.fare=m.fares[m.fares.length-1]; m.fareJB=I_BDG>=0?m.fares[m.idx.indexOf(I_BDG)]:null;
  // energy at the overhead line
  // With gradients it is the mean of the two directions: trains run both ways, and one climbs where the other coasts.
  let Et=J.Et,Er=J.Er,totalSec=J.T; m.grade=null;
  if(m.G){
    const run=(P,zones,grade)=>{let t=0,et=0,er=0;for(let k=1;k<P.length;k++){const r=simLeg(P[k-1],P[k],tr,zones,false,grade);t+=r.t;et+=r.Et;er+=r.Er;}return {T:t*(1+s.pad)+s.dwell*60*(P.length-2),Et:et,Er:er};};
    const wire=q=>q.Et/s.eta/3.6e6-q.Er*s.regen*s.eta/3.6e6+s.aux*q.T/3600, P=m.idx.map(i=>m.pos[i]);
    const west=run(P.map(x=>m.L-x).reverse(),m.zones.map(z=>m.L-z),gradeCells(RT,s.alignf,true)), flat=run(P,m.zones,null);
    let up=0,down=0,steep=0;for(let k=0;k<m.G.length;k++){const dz=m.G[k]*Math.min(GCELL,m.L-k*GCELL)*1000;if(dz>0)up+=dz;else down-=dz;if(Math.abs(m.G[k])>steep)steep=Math.abs(m.G[k]);}
    m.grade={up,down,steep,Teast:J.T/60,Twest:west.T/60,Tflat:flat.T/60,Eeast:wire(J),Ewest:wire(west),Eflat:wire(flat)};
    Et=(J.Et+west.Et)/2;Er=(J.Er+west.Er)/2;totalSec=(J.T+west.T)/2;
  }
  m.Etrac=Et/s.eta/3.6e6; m.Eregen=Er*s.regen*s.eta/3.6e6; m.Eaux=s.aux*totalSec/3600; m.E=m.Etrac-m.Eregen+m.Eaux; // kWh
  m.Rmax=tr.R(tr.vmax); m.Pcruise=m.Rmax*tr.vmax; m.resid=tr.acc(tr.vmax);
  { let v=0,t=0,d=0;const dt=0.5;while(v<tr.vmax-0.01&&t<3600){const a=tr.acc(v);if(a<=1e-4)break;v=Math.min(tr.vmax,v+a*dt);d+=v*dt;t+=dt;} m.t0=t;m.d0=d/1000;m.reaches=v>=tr.vmax-0.02; }
  m.brakeKm=tr.vmax*tr.vmax/(2*tr.dec)/1000;
  { let pen=0,cnt=0;const e=journey(MUST_IDX).T;if(m.nStops>N_MUST){pen=(J.T-e)/(m.nStops-N_MUST)/60;} m.stopPenalty=pen; m.Texpress=e/60; }
  // flight
  // two legs into Juanda: from Halim (HLP) and from Soekarno–Hatta (CGK). m.air, m.d2dAir, m.fareAir are the averages weighted by each airport's share of flights.
  m.paxAir=s.seatsair*s.lfair; const wC=s.cgkshare, wH=1-wC;
  const fleg=(code,name,gc,fareV,block,acc,w)=>{const dfl=gc*s.route,fuel=s.lto+s.burn*dfl,comb=fuel*CO2_PER_KG_FUEL/m.paxAir,mfg=s.planeco2*1000/AIRCRAFT_CYCLES/m.paxAir;
    return {code,name,w,gc,dfl,fuel,fare:fareV,block,co2:{comb,up:comb*(s.wtt-1),non:comb*(s.rfi-1),mfg,apt:s.apco2,gross:comb*(s.wtt+s.rfi-1)+mfg+s.apco2},d2d:{acc,pre:s.fpre,ride:block,post:s.fpost,egr:s.fegr}};};
  m.legs=[fleg("HLP","Halim Perdanakusuma",GC_KM,s.ffare,s.fblock,s.facc,wH),fleg("CGK","Soekarno–Hatta",GC_CGK,s.cfare,s.cblock,s.cacc,wC)];
  const avg=f=>wH*f(m.legs[0])+wC*f(m.legs[1]);
  m.gc=avg(l=>l.gc); m.dfl=avg(l=>l.dfl); m.fuel=avg(l=>l.fuel); m.fareAir=avg(l=>l.fare); m.blockAir=avg(l=>l.block);
  m.air={comb:avg(l=>l.co2.comb),up:avg(l=>l.co2.up),non:avg(l=>l.co2.non),mfg:avg(l=>l.co2.mfg),apt:s.apco2}; m.air.gross=m.air.comb+m.air.up+m.air.non+m.air.mfg+m.air.apt;
  // train emissions
  m.paxRail=SEATS*s.lf; m.ridersYr=s.trains*2*365*m.paxRail; m.trainsYr=s.trains*2*365;
  m.rail={trac:(m.Etrac-m.Eregen)*s.grid/1000/m.paxRail,aux:m.Eaux*s.grid/1000/m.paxRail,emb:s.infraco2*m.L*1000/s.clife/m.ridersYr};
  m.sets=Math.ceil(s.trains*2*(m.Tmin+TURNAROUND_MIN)/60/SERVICE_HOURS*1.1);
  m.rail.veh=m.sets*s.trainco2*1000/TRAIN_LIFE_YR/m.ridersYr;            // building the trainsets, spread over their service life
  m.rail.op=m.rail.trac+m.rail.aux; m.rail.gross=m.rail.op+m.rail.emb+m.rail.veh;
  // offsets
  const on=!!s.offset, sh=on?s.oshare:0;
  for(const x of [m.rail,m.air,m.legs[0].co2,m.legs[1].co2]){x.net=x.gross*(1-sh*s.oqual);x.offCost=x.gross/1000*sh*s.oprice*s.fx;}
  m.offsetOn=on;
  // door to door, generalised cost
  m.d2dRail={acc:s.tacc,pre:s.tpre,ride:m.Tmin,post:0,egr:s.tegr}; m.d2dAir={acc:avg(l=>l.d2d.acc),pre:s.fpre,ride:m.blockAir,post:s.fpost,egr:s.fegr};
  for(const d of [m.d2dRail,m.d2dAir,m.legs[0].d2d,m.legs[1].d2d])d.total=d.acc+d.pre+d.ride+d.post+d.egr;
  m.levy=s.fsur; m.ticketAir=m.fareAir+m.levy;                         // what a flyer pays: the airline's fare plus the government surcharge
  m.priceRail=m.fare.total+m.rail.offCost; m.priceAir=m.ticketAir+m.air.offCost;
  m.gcRail=m.priceRail+s.vot*m.d2dRail.total/60; m.gcAir=m.priceAir+s.vot*m.d2dAir.total/60; m.gcRatio=m.gcRail/m.gcAir;
  m.parity=m.d2dAir.total-(s.tacc+s.tpre+s.tegr);                       // in-train minutes at which door-to-door times tie
  for(const l of m.legs){l.ticket=l.fare+m.levy;l.price=l.ticket+l.co2.offCost;l.gcost=l.price+s.vot*l.d2d.total/60;l.ratio=m.gcRail/l.gcost;l.parity=l.d2d.total-(s.tacc+s.tpre+s.tegr);}
  // the surcharge at which the train's generalised cost equals the flight's, and the one at which it falls to 90 % of it and the verdict turns
  for(const x of [m,...m.legs]){const g0=(x===m?m.gcAir:x.gcost)-m.levy;x.levyTie=Math.max(0,m.gcRail-g0);x.levyWin=Math.max(0,m.gcRail/0.9-g0);}
  m.share=1/(1+Math.exp(1.1*(m.Tmin/60-3.9)));
  m.shareLevy=m.levy>0&&s.vot>0?shareRule(m.Tmin/60-m.levy/s.vot):null; // the surcharge counted as the hours it is worth, taken off the train ride
  // economics of the extension only
  const fx=s.fx, f=m.ext/m.L;
  m.capex=m.ext*s.capex*1e6*fx; m.annCap=m.capex*crf(s.wacc,s.life);
  m.rev=m.ridersYr*m.fare.total*f;
  m.cEnergy=m.E*f*m.trainsYr*s.elec; m.cTrain=m.trainsYr*m.ext*s.opex_train*fx; m.cInfra=m.ext*s.opex_infra*1000*fx;
  m.opex=m.cEnergy+m.cTrain+m.cInfra; m.cost=m.opex+m.annCap; m.cover=m.rev/m.cost; m.opRatio=m.rev/m.opex;
  m.capCover=(m.rev-m.opex)/m.annCap;
  m.beFare=m.fare.total*m.cost/m.rev; m.beLF=s.lf*m.cost/m.rev; // approximate: ignores that energy and train cost do not change with load
  // carbon payback of building the extension
  m.embExt=s.infraco2*m.ext; const save=(m.air.gross-m.air.apt-m.rail.op-m.rail.veh)*f*m.ridersYr*s.divert/1000; // airports already exist, so their share is not saved
  m.payback=save>0?m.embExt/save:Infinity;
  // every stopping pattern: there are thousands, so only the fastest and slowest for each number of stops
  const patFare=(T,n)=>fare(m.L,T,n).total, names=idx=>idx.slice(1,-1).filter(i=>!ST[i].must).map(i=>SHORT[ST[i].id]);
  m.patCur={n:m.idx.length,T:J.T/60,fare:patFare(J.T,m.idx.length),names:names(m.idx)};
  { // best[j][c] = least (or most) running time to station j when j is served and c optional stations up to j are served
    const n=ST.length,K=OPT.length,lastMust=ST.map((x,i)=>{let k=i-1;while(k>0&&!ST[k].must)k--;return Math.max(0,k);});
    const dp=sgn=>{const best=ST.map(()=>new Float64Array(K+1).fill(Infinity)),from=ST.map(()=>new Int16Array(K+1).fill(-1));best[0][0]=0;
      for(let j=1;j<n;j++){const o=ST[j].must?0:1;for(let i=lastMust[j];i<j;i++){const t=sgn*leg(i,j).t;for(let c=0;c+o<=K;c++){const v=best[i][c]+t;if(v<best[j][c+o]){best[j][c+o]=v;from[j][c+o]=i;}}}}
      return c=>{const idx=[];for(let j=n-1,k=c;j>=0;){idx.unshift(j);const i=from[j][k];if(i<0)break;k-=ST[j].must?0:1;j=i;}const N=idx.length,T=sgn*best[n-1][c]*(1+s.pad)+s.dwell*60*(N-2);return {n:N,T:T/60,fare:patFare(T,N),names:names(idx)};};};
    const lo=dp(1),hi=dp(-1);m.patRanges=[];for(let c=0;c<=K;c++)m.patRanges.push({c,lo:lo(c),hi:hi(c)});
  }
  // sensitivity to line speed
  m.sens=[];for(let v=200;v<=400;v+=10){const t2=mkTrain(s,v);let run=0;for(let k=1;k<m.idx.length;k++)run+=simLeg(m.pos[m.idx[k-1]],m.pos[m.idx[k]],t2,m.zones,false,m.G).t;m.sens.push([v,(run*(1+s.pad)+s.dwell*60*(m.idx.length-2))/60]);}
  // verdicts
  const dT=m.d2dRail.total-m.d2dAir.total, dP=m.priceRail-m.priceAir;
  const tWord=Math.abs(dT)<3?"the same time":fmtDur(Math.abs(dT))+(dT<0?" faster":" slower"), pWord=Math.abs(dP)<5000?"the same price":fmtRp(Math.abs(dP))+(dP<0?" cheaper":" dearer");
  m.vT={cls:m.gcRatio<0.9?"good":m.gcRatio<=1.1?"mid":"bad",big:m.gcRatio<0.9?"Take the train":m.gcRatio<=1.1?"Toss-up":"Fly",
    why:`Door to door the train is <b>${tWord}</b> and <b>${pWord}</b> than the average flight (${pct(wC)} from CGK). Counting time at ${fmtRp(s.vot)}/h, the train trip costs <b>${pct(m.gcRatio)}</b> of flying: ${pct(m.legs[0].ratio)} of the HLP flight, ${pct(m.legs[1].ratio)} of the CGK flight.${m.levy>0?` Flight prices include the <b>${fmtRp(m.levy)}</b> surcharge.`:""}`};
  m.vI={cls:m.cover>=1?"good":m.opRatio>=1?"mid":"bad",big:m.cover>=1?"Pays for itself":m.opRatio>=1?"Needs public money":"Loses on every train",
    why:m.opRatio>=1?`Fares cover operations and <b>${pct(Math.max(0,m.capCover))}</b> of the yearly payment on ${fmtUSD(m.capex/fx)} of construction. Break-even fare: <b>${fmtRp(m.beFare)}</b>.`
      :`Fares cover only <b>${pct(m.opRatio)}</b> of operating cost, before any of the ${fmtUSD(m.capex/fx)} of construction. Break-even fare: <b>${fmtRp(m.beFare)}</b>.`};
  const er=m.rail.net/m.air.net;
  m.vP=(m.rail.net<0.5&&m.air.net<0.5)?{cls:"mid",big:"Neutralised on paper",why:"Both modes offset all their emissions with full-integrity credits."}
    :{cls:er<0.85?"good":er<=1.15?"mid":"bad",big:er<0.85?"Train is cleaner":er<=1.15?"No clear winner":"Flying emits less",
    why:`Train <b>${fmtKg(m.rail.net)}</b> vs flight <b>${fmtKg(m.air.net)}</b> CO₂e per passenger${on?" after offsets":""}. ${m.rail.emb>m.rail.op?"Building the line outweighs running the trains.":s.grid>=600?"A coal-heavy grid keeps the train's footprint high.":"Electricity is cleaner than jet fuel here."}`};
  const okT=m.vT.cls!=="bad";
  m.overall=okT&&m.vI.cls==="good"?{cls:"good",big:"Feasible",why:"Competitive with the flight and able to repay its construction from fares."}
    :okT&&m.vI.cls==="mid"?{cls:"mid",big:"Feasible as a service, not as an investment",why:"Travellers would use it, and fares cover the running costs, but not the construction. It needs the state to carry most of the capital, as it did for the first line."}
    :okT?{cls:"bad",big:"Attractive to travellers, unaffordable to run",why:"Competitive with the flight at this fare, but the fare does not even cover operating costs."}
    :m.vI.cls==="good"?{cls:"mid",big:"Pays its way, but loses to the flight",why:"At these settings most end-to-end travellers would still fly; the line would live on intermediate cities."}
    :{cls:"bad",big:"Not feasible at these settings",why:"It loses to the flight on time and price, and fares do not repay the line."};
  return m;
}

// ---------- render helpers ----------
function tile(k,v,unit,sub){return`<div class="tile"><div class="k">${k}</div><div class="v">${v}${unit?`<small>${unit}</small>`:""}</div>${sub?`<div class="sub">${sub}</div>`:""}</div>`;}
function kv(rows){return`<table class="kv">${rows.map(r=>`<tr${r[3]?' class="total"':''}><td>${r[0]}${r[2]?`<span class="f">${r[2]}</span>`:""}</td><td>${r[1]}</td></tr>`).join("")}</table>`;}
// comparison table: heads=[[label,class]], rows=[label,[cells],formula?,total?]
function cmp(heads,rows){return`<div class="cmpwrap"><table class="cmp"><tr><th></th>${heads.map(h=>`<th class="${h[1]}">${h[0]}</th>`).join("")}</tr>${rows.map(r=>`<tr${r[3]?' class="total"':''}><td>${r[0]}${r[2]?`<span class="f">${r[2]}</span>`:""}</td>${r[1].map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</table></div>`;}
// horizontal stacked bars: rows=[{label,segs:[[name,value,color]],total?}]
function hbars(rows,fmt,opts={}){
  const W=560,LW=opts.lw||70,RW=opts.rw||110,pw=W-LW-RW,bh=opts.bh||26,gap=14,top=6;
  const max=Math.max(...rows.map(r=>r.segs.reduce((a,x)=>a+Math.max(0,x[1]),0)),opts.min||1e-9)*1.02;
  const H=top+rows.length*(bh+gap)+(opts.axis?18:0);
  let svg=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">`;
  rows.forEach((r,i)=>{const y=top+i*(bh+gap);let x=LW,sum=0;
    svg+=`<text x="${LW-8}" y="${y+bh/2+4}" text-anchor="end" font-size="12.5" font-weight="600" fill="${r.color||"var(--text-2)"}">${r.label}</text>`;
    r.segs.forEach(sg=>{if(sg[1]<=0)return;const w=pw*sg[1]/max;sum+=sg[1];
      svg+=`<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(0.5,w-1.5).toFixed(1)}" height="${bh}" rx="3" fill="${sg[2]}" data-tip="${esc(r.label+" · "+sg[0]+": "+fmt(sg[1]))}"/>`;
      if(w>54&&opts.inlabel)svg+=`<text x="${(x+w/2).toFixed(1)}" y="${y+bh/2+4}" text-anchor="middle" font-size="10.5" fill="#fff" pointer-events="none">${opts.inlabel(sg)}</text>`;
      x+=w;});
    svg+=`<text x="${(x+6).toFixed(1)}" y="${y+bh/2+4}" font-size="12.5" font-weight="650" fill="var(--text)" style="font-variant-numeric:tabular-nums">${r.total||fmt(sum)}</text>`;});
  svg+=`</svg>`;
  const seen=new Map();rows.forEach(r=>r.segs.forEach(sg=>{if(sg[1]>0&&!seen.has(sg[0]))seen.set(sg[0],sg[2]);}));
  return svg+`<div class="legend">${[...seen].map(([n,c])=>`<span><i style="background:${c}"></i>${n}</span>`).join("")}</div>`;
}
const niceStep=(range,n)=>{const raw=range/n,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;return (f<1.5?1:f<3.5?2:f<7.5?5:10)*p;};

// ---------- render ----------
let M=null;
function update(){
  CTLS.forEach(c=>{state[c.id]=ctlVal(c);const o=document.getElementById("out_"+c.id);if(o)o.textContent=c.fmt(state[c.id]);});
  CTLS.forEach(c=>{if(c.dep)document.getElementById("ctl_"+c.id).classList.toggle("off",!state[c.dep]);});
  document.querySelectorAll("#stopList input").forEach(el=>{if(!el.disabled)el.checked=stops.has(el.dataset.stop);});
  const s=state,m=M=model(s,stops);
  ST.forEach((x,i)=>{document.getElementById("km_"+x.id).textContent="km "+fmtNum(m.pos[i],0);});
  document.getElementById("stopCount").textContent=m.nStops+" of "+ST.length+" stations";
  scheduleURL();
  const fx=s.fx, usd=v=>fmtUSD(v/fx);

  document.getElementById("overall").className="overall "+m.overall.cls;
  document.getElementById("overall").innerHTML=`<div class="lab">Is the route feasible?</div><div class="big">${m.overall.big}</div><div class="why">${m.overall.why}</div>`;
  const vc=(v,lab,g,ref)=>`<div class="vcard ${v.cls}">${glyph(g)}<div><div class="lab">${lab}${refBtn(ref)}</div><div class="big">${v.big}</div><div class="why">${v.why}</div></div></div>`;
  document.getElementById("verdicts").innerHTML=vc(m.vT,"Traveller's verdict · train vs flights from HLP and CGK","door","r_verdictT")+vc(m.vI,"Investor's verdict · the extension","economics","r_verdictI")+vc(m.vP,"Planet's verdict · CO₂ per passenger","environment","r_verdictP");

  const dT=m.d2dRail.total-m.d2dAir.total,[H,C]=m.legs;
  document.getElementById("hero").innerHTML=
    tile("Jakarta → Surabaya by train"+refBtn("sec_speed"),fmtDur(m.Tmin),"",`${m.nStops-2} intermediate stop${m.nStops===3?"":"s"} · ${fmtNum(m.L,0)} km · average ${fmtNum(m.avg,0)} km/h`)+
    tile("Estimated fare"+refBtn("fjb"),fmtRp(m.fare.total),"",`${fmtNum(m.fare.total/s.fjb,1)}× the Bandung fare · Rp ${fmtNum(m.fare.total/m.L,0)}/km · ${usd(m.fare.total)}`)+
    tile("Door to door"+refBtn("sec_d2d"),fmtDur(m.d2dRail.total),"",`via HLP ${fmtDur(H.d2d.total)} · via CGK ${fmtDur(C.d2d.total)} · train is ${fmtDur(Math.abs(dT))} ${dT<=0?"faster":"slower"} than the average flight`+(dT<=0?flag("train faster","ok"):""))+
    tile("Average flight fare"+refBtn("cgkshare"),fmtRp(m.ticketAir),"",`${m.levy>0?"with the "+fmtRp(m.levy)+" surcharge · ":""}HLP ${fmtRp(H.ticket)} · CGK ${fmtRp(C.ticket)} · ${pct(s.cgkshare)} fly from CGK · train is ${fmtRp(Math.abs(m.priceRail-m.priceAir))} ${m.priceRail<=m.priceAir?"cheaper":"dearer"}${m.offsetOn?" incl. offsets":""}`)+
    tile("CO₂ per passenger"+refBtn("sec_co2"),fmtKg(m.rail.net),"",`flight ${fmtKg(m.air.net)} · train emits ${pct(m.rail.net/m.air.net)} of the flight`+(m.offsetOn?" · after offsets":""))+
    tile("Rail share of rail + air"+refBtn("r_share"),pct(m.share),"",`rule of thumb from the ${fmtDur(m.Tmin)} ride alone`+(m.shareLevy!=null?` · ${pct(m.shareLevy)} if the surcharge counts as the travel time it is worth`:""))+
    tile("Extension to build"+refBtn("capex"),usd(m.capex),"",`${fmtNum(m.ext,0)} km · ${fmtRp(m.capex)} · ${fmtNum(m.capex/fx/7.3e9,1)}× the first line`)+
    tile("Cost covered by fares"+refBtn("sec_econ"),pct(m.cover),"",`operations ${pct(m.opRatio)} covered · ${fmtNum(m.ridersYr/1e6,1)} M passengers/yr`+(m.cover<0.5?flag("deep subsidy","bad"):m.cover<1?flag("subsidy","warn"):""));

  // cards
  let tt=`<table class="tt"><tr><th>Station</th><th>km</th><th>arrives</th><th>fare from Jakarta</th></tr>`;
  ST.forEach((x,i)=>{const k=m.idx.indexOf(i);tt+=k<0?`<tr class="skip"><td>${x.name}</td><td>${fmtNum(m.pos[i],0)}</td><td>passes</td><td>–</td></tr>`
    :`<tr><td>${x.name}</td><td>${fmtNum(m.pos[i],0)}</td><td>${k?fmtHM(m.arr[k]/60):"0:00"}</td><td>${k?fmtRp(m.fares[k].total):"–"}</td></tr>`;});
  tt+=`</table>`;
  const sd=Math.max(0,1-s.st-s.ss);
  document.getElementById("cards").innerHTML=
   `<div class="card"><h2>${ico("route")}Timetable<span>h:mm from Halim</span></h2>${tt}${kv([
      ["Fastest running time",fmtDur(m.J.run/60),"sum of the runs between stops"],
      ["Timetable margin",fmtDur(m.J.run*s.pad/60),"T_run × "+pct(s.pad)],
      ["Dwell at "+(m.nStops-2)+" stops",fmtDur(s.dwell*(m.nStops-2))],
      ["Jakarta → Surabaya",fmtDur(m.Tmin),"",true],
      ["Cost of each stop"+refBtn("stops"),m.nStops>N_MUST?fmtNum(m.stopPenalty,1)+" min":"–","(T − T_express) ÷ optional stops · express = "+fmtDur(m.Texpress)],
      ["Model check: Halim → Tegalluar via Karawang and Padalarang"+refBtn("pad"),fmtDur(m.Tref/60),"published timetable ≈ 45–55 min"],
    ])}</div>`+
   `<div class="card"><h2>${ico("train")}Train physics${refBtn("r_resist")}<span>8 cars · ${SEATS} seats</span></h2>${kv([
      ["Resistance at "+s.vmax+" km/h",fmtNum(m.Rmax/1000,1)+" kN","R = W·(0.79 + 0.0064·V + 0.000076·V²) N/kN"],
      ["Power to hold "+s.vmax+" km/h",fmtNum(m.Pcruise/1e6,2)+" MW"+(m.resid<=0?flag("underpowered","bad"):""),"P = R·v · available "+s.pwr.toFixed(2)+" MW"],
      ["Acceleration left at line speed",fmtNum(Math.max(0,m.resid),3)+" m/s²","a = (P/v − R) ÷ (1.04·m)"],
      ["0 → "+(m.reaches?s.vmax:"top")+" km/h",m.reaches?fmtDur(m.t0/60)+" · "+fmtNum(m.d0,1)+" km":"not reached"+flag("power-limited","warn"),"constant "+s.acc.toFixed(2)+" m/s², then constant power"],
      ["Braking from "+s.vmax+" km/h",fmtNum(m.brakeKm,1)+" km","d = v² ÷ (2·b)"],
      ["Highest speed reached",fmtNum(Math.max(...m.J.legs.map(l=>l.vmax))*3.6,0)+" km/h"],
      ["Traction energy"+refBtn("eta"),fmtNum(m.Etrac,0)+" kWh","Σ F·Δs ÷ η, F = 1.04·m·a + R"],
      ["Recovered by braking"+refBtn("regen"),"− "+fmtNum(m.Eregen,0)+" kWh","Σ F_brake·Δs × "+pct(s.regen)+" × η"],
      ["Auxiliaries"+refBtn("aux"),fmtNum(m.Eaux,0)+" kWh",s.aux+" kW × "+fmtDur(m.Tmin)],
      ["Energy per trip, at the wire",fmtNum(m.E/1000,1)+" MWh","",true],
      ["Per train-km · per seat-km",fmtNum(m.E/m.L,1)+" kWh · "+fmtNum(m.E/m.L/SEATS*1000,0)+" Wh","published for Fuxing: ≈ 38 Wh per passenger-km at 350 km/h; 17.3 kWh per train-km over a duty cycle"],
      ...(m.grade?[
        ["Rail level, eastbound"+refBtn("grade"),"↑ "+fmtNum(m.grade.up,0)+" m · ↓ "+fmtNum(m.grade.down,0)+" m","steepest gradient "+fmtNum(m.grade.steep*1000,0)+" ‰ · the train holds line speed up to "+fmtNum(Math.max(0,m.resid*ROT/G*1000),1)+" ‰"],
        ["Travel time, eastbound · westbound",fmtDur(m.grade.Teast)+" · "+fmtDur(m.grade.Twest),"on level track: "+fmtDur(m.grade.Tflat)],
        ["Energy, eastbound · westbound",fmtNum(m.grade.Eeast/1000,1)+" · "+fmtNum(m.grade.Ewest/1000,1)+" MWh","on level track: "+fmtNum(m.grade.Eflat/1000,1)+" MWh · the energy per trip above is the mean of the two directions"],
      ]:[]),
    ])}</div>`+
   `<div class="card"><h2>${ico("fare")}Fare build-up${refBtn("beta")}<span>scaled from the Jakarta–Bandung fare</span></h2>${kv([
      ["Jakarta–Bandung fare today"+refBtn("fjb"),fmtRp(s.fjb),"F₀ · Rp "+fmtNum(s.fjb/WHOOSH_KM,0)+"/km over 142.3 km"],
      ["Distance part",fmtRp(m.fare.parts[0]),`F₀ × ${pct(sd)} × (${fmtNum(m.L,0)} ÷ 142.3)^${s.beta.toFixed(2)}`],
      ["Time part"+refBtn("st"),fmtRp(m.fare.parts[1]),`F₀ × ${pct(s.st)} × ${fmtDur(m.Tmin)} ÷ ${fmtDur(m.Tref/60)}`],
      ["Station part"+refBtn("ss"),fmtRp(m.fare.parts[2]),`F₀ × ${pct(s.ss)} × ${m.nStops} stations ÷ ${N_REF}`],
      ["Jakarta–Surabaya fare",fmtRp(m.fare.total),"",true],
      ["Per km",`Rp ${fmtNum(m.fare.total/m.L,0)}`,"Jakarta–Bandung: Rp "+fmtNum(s.fjb/WHOOSH_KM,0)+" · the average flight: Rp "+fmtNum(m.fareAir/m.gc,0)],
      ["Pure per-km extrapolation",fmtRp(s.fjb*m.L/WHOOSH_KM),"F₀ × L ÷ 142.3, ignoring taper, time and stations"],
      ...(m.fareJB?[["Jakarta–Bandung in this pattern",fmtRp(m.fareJB.total),stops.has("karawang")?"same service as today":"cheaper than today: no Karawang stop"]]:[]),
      ["Benchmarks"+refBtn("r_bench"),"Rp "+fmtNum(600*2700/1318,0)+" · Rp "+fmtNum(14720*114/515,0)+" /km","Beijing–Shanghai · Tokyo–Osaka, at 1 yuan ≈ Rp 2,700 and 1 yen ≈ Rp 114"],
    ])}</div>`+
   `<div class="card"><h2>${ico("plane")}The flights<span>two Jakarta airports → Juanda</span></h2>${cmp([["HLP","a"],["CGK","a2"]],[
      ["Share of Jakarta–Surabaya flights"+refBtn("cgkshare"),[H,C].map(l=>pct(l.w))],
      ["Great-circle distance"+refBtn("r_flightdist"),[H,C].map(l=>fmtNum(l.gc,0)+" km"),"haversine to SUB · the railway is "+fmtNum(m.L/H.gc,2)+"× the HLP distance"],
      ["Distance flown"+refBtn("route"),[H,C].map(l=>fmtNum(l.dfl,0)+" km"),"d_gc × "+s.route.toFixed(2)],
      ["Block time"+refBtn("fblock"),[H,C].map(l=>fmtDur(l.block)),"gate-to-gate average "+[H,C].map(l=>fmtNum(l.gc/(l.block/60),0)).join(" and ")+" km/h"],
      ["City → airport"+refBtn("facc"),[H,C].map(l=>MIN(l.d2d.acc))],
      ["Fare"+refBtn("ffare"),[H,C].map(l=>fmtRp(l.fare)),[H,C].map(l=>"Rp "+fmtNum(l.fare/l.gc,0)).join(" and ")+" per km"],
      ...(m.levy>0?[["Government surcharge"+refBtn("fsur"),[H,C].map(()=>fmtRp(m.levy))],["Ticket price",[H,C].map(l=>fmtRp(l.ticket)),"fare + surcharge"]]:[]),
      ["Fuel burned"+refBtn("lto"),[H,C].map(l=>fmtNum(l.fuel,0)+" kg"),`${s.lto} + ${s.burn.toFixed(2)} × distance flown`],
      ["Fuel per passenger",[H,C].map(l=>fmtNum(l.fuel/m.paxAir,1)+" kg"),"÷ "+fmtNum(m.paxAir,0)+" on board ("+s.seatsair+" seats × "+pct(s.lfair)+")"],
      ["CO₂e per passenger, gross",[H,C].map(l=>fmtKg(l.co2.gross))],
      ["Door to door",[H,C].map(l=>fmtDur(l.d2d.total)),"",true],
    ])}</div>`+
   `<div class="card" style="grid-column:1/-1"><h2>${ico("door")}Train vs flight${refBtn("sec_gc")}<span>one way, central Jakarta to central Surabaya</span></h2>${cmp([["Train","r"],["Fly from HLP","a"],["Fly from CGK","a2"],["Average flight","a3"]],[
      ["To the terminal",[MIN(s.tacc),MIN(H.d2d.acc),MIN(C.d2d.acc),MIN(Math.round(m.d2dAir.acc))]],
      ["Waiting before departure",[MIN(s.tpre),MIN(s.fpre),MIN(s.fpre),MIN(s.fpre)]],
      ["In the vehicle",[fmtDur(m.Tmin),fmtDur(H.block),fmtDur(C.block),fmtDur(m.blockAir)]],
      ["Leaving the terminal",["–",MIN(s.fpost),MIN(s.fpost),MIN(s.fpost)]],
      ["To the destination",[MIN(s.tegr),MIN(s.fegr),MIN(s.fegr),MIN(s.fegr)]],
      ["Door to door",[fmtDur(m.d2dRail.total),fmtDur(H.d2d.total),fmtDur(C.d2d.total),fmtDur(m.d2dAir.total)],"",true],
      ["Ticket",[fmtRp(m.fare.total),fmtRp(H.fare),fmtRp(C.fare),fmtRp(m.fareAir)]],
      ...(m.levy>0?[["Government surcharge on flights"+refBtn("fsur"),["–",fmtRp(m.levy),fmtRp(m.levy),fmtRp(m.levy)]]]:[]),
      ...(m.offsetOn?[["Offset surcharge",[fmtRp(m.rail.offCost),fmtRp(H.co2.offCost),fmtRp(C.co2.offCost),fmtRp(m.air.offCost)],`gross CO₂ × ${pct(s.oshare)} × US$${fmtNum(s.oprice,0)}/t`]]:[]),
      ["Value of the time spent",[m.d2dRail,H.d2d,C.d2d,m.d2dAir].map(d=>fmtRp(s.vot*d.total/60)),"door-to-door hours × "+fmtRp(s.vot)],
      ["Generalised cost",[fmtRp(m.gcRail),fmtRp(H.gcost),fmtRp(C.gcost),fmtRp(m.gcAir)],"",true],
      ["Train's generalised cost as a share of this flight",["–",pct(H.ratio),pct(C.ratio),pct(m.gcRatio)],"below 90 % the train wins, above 110 % the flight wins"],
      ["Flight surcharge at which the train ties this flight"+refBtn("fsur"),["–",fmtRp(H.levyTie),fmtRp(C.levyTie),fmtRp(m.levyTie)],"train's generalised cost − the flight's before any surcharge · Rp 0 = the train already ties or wins"],
      ["Flight surcharge at which the train wins",["–",fmtRp(H.levyWin),fmtRp(C.levyWin),fmtRp(m.levyWin)],"the train then costs 90 % of the flight"],
      ["CO₂e per passenger"+(m.offsetOn?", after offsets":""),[fmtKg(m.rail.net),fmtKg(H.co2.net),fmtKg(C.co2.net),fmtKg(m.air.net)]],
      ["Train time at which door-to-door times tie",["–",fmtDur(H.parity),fmtDur(C.parity),fmtDur(m.parity)],"D2D_flight − station access, wait and egress"],
      ["Share of flights"+refBtn("cgkshare"),["–",pct(H.w),pct(C.w),"100%"],"the average column weights the two airports by this share"],
    ])}</div>`+
   `<div class="card" style="grid-column:1/-1"><h2>${ico("environment")}Environment${refBtn("sec_co2")}<span>per passenger, one way · ${fmtKg1(m.rail.emb+m.rail.veh)} of the train's footprint and ${fmtKg1(m.air.mfg+m.air.apt)} of the flight's is building things</span></h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px">
      <div><div class="lab2" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--rail);margin-bottom:4px;font-weight:600">Train</div>${kv([
        ["Electricity per passenger",fmtNum(m.E/m.paxRail,1)+" kWh",fmtNum(m.E/1000,1)+" MWh ÷ ("+SEATS+" × "+pct(s.lf)+")"],
        ["Traction, net of regeneration"+refBtn("grid"),fmtKg(m.rail.trac),"kWh × "+s.grid+" g"],
        ["Auxiliaries",fmtKg(m.rail.aux)],
        ["Building the line"+refBtn("infraco2"),fmtKg(m.rail.emb),`${fmtNum(s.infraco2,0)} t/km × ${fmtNum(m.L,0)} km ÷ ${s.clife} yr ÷ ${fmtNum(m.ridersYr/1e6,1)} M riders`],
        ["Building the trainsets"+refBtn("trainco2"),fmtKg1(m.rail.veh),`${m.sets} sets × ${fmtNum(s.trainco2,0)} t ÷ ${TRAIN_LIFE_YR} yr ÷ ${fmtNum(m.ridersYr/1e6,1)} M riders`],
        ["Gross",fmtKg(m.rail.gross),fmtNum(m.rail.gross/m.L*1000,0)+" g per passenger-km",true],
        ...(m.offsetOn?[["Offsets"+refBtn("offset"),"− "+fmtKg(m.rail.gross-m.rail.net),`gross × ${pct(s.oshare)} × ${pct(s.oqual)} · costs ${fmtRp(m.rail.offCost)}`],["Net",fmtKg(m.rail.net),"",true]]:[]),
      ])}</div>
      <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--air);margin-bottom:4px;font-weight:600">Flight, average of HLP and CGK</div>${kv([
        ["Fuel per passenger",fmtNum(m.fuel/m.paxAir,1)+" kg",fmtNum(m.fuel,0)+" kg ÷ "+fmtNum(m.paxAir,0)+" · HLP "+fmtNum(H.fuel/m.paxAir,1)+", CGK "+fmtNum(C.fuel/m.paxAir,1)+" kg"],
        ["Combustion",fmtKg(m.air.comb),"fuel × 3.16 kg CO₂/kg"],
        ["Fuel production"+refBtn("wtt"),fmtKg(m.air.up),"combustion × ("+s.wtt.toFixed(2)+" − 1)"],
        ["Non-CO₂ effects"+refBtn("rfi"),fmtKg(m.air.non),"combustion × ("+s.rfi.toFixed(1)+" − 1)"],
        ["Building the aircraft"+refBtn("planeco2"),fmtKg1(m.air.mfg),`${fmtNum(s.planeco2,0)} t ÷ ${fmtNum(AIRCRAFT_CYCLES,0)} flights ÷ ${fmtNum(m.paxAir,0)} passengers`],
        ["Building the airports"+refBtn("apco2"),fmtKg1(m.air.apt),"both ends, per passenger handled"],
        ["Gross",fmtKg(m.air.gross),fmtNum(m.air.gross/m.gc*1000,0)+" g per passenger-km · HLP "+fmtKg(H.co2.gross)+", CGK "+fmtKg(C.co2.gross),true],
        ...(m.offsetOn?[["Offsets"+refBtn("offset"),"− "+fmtKg(m.air.gross-m.air.net),`gross × ${pct(s.oshare)} × ${pct(s.oqual)} · costs ${fmtRp(m.air.offCost)}`],["Net",fmtKg(m.air.net),"",true]]:[]),
      ])}</div>
      <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2);margin-bottom:4px;font-weight:600">The bigger picture</div>${kv([
        ["Grid intensity at which the train ties"+refBtn("grid"),(()=>{const g=(m.air.gross-m.rail.emb-m.rail.veh)/(m.E/m.paxRail)*1000;return g>0?fmtNum(g,0)+" g/kWh":"never";})(),"(flight − line − trainsets) ÷ kWh per passenger, before offsets"],
        ["Carbon to build the extension",fmtT(m.embExt),fmtNum(s.infraco2,0)+" t/km × "+fmtNum(m.ext,0)+" km"],
        ["Saved per year by riders who would have flown"+refBtn("divert"),isFinite(m.payback)?fmtT(m.embExt/m.payback):"none",`riders × ${pct(s.divert)} × (flight without airports − train operation and trainsets) × L_ext ÷ L`],
        ["Carbon payback of construction",isFinite(m.payback)?fmtNum(m.payback,m.payback<10?1:0)+" yr"+(m.payback>s.clife?flag("longer than the line lasts","bad"):""):"never"+flag("train emits more","bad")],
        ["Train's yearly electricity",fmtNum(m.E*m.trainsYr/1e6,0)+" GWh",fmtNum(m.trainsYr,0)+" trains × "+fmtNum(m.E/1000,1)+" MWh"],
      ])}</div></div></div>`+
   `<div class="card" style="grid-column:1/-1"><h2>${ico("economics")}Economics of the extension${refBtn("sec_econ")}<span>${RT.skipsBandung?"Karawang → Surabaya only":"Bandung → Surabaya only"} · per year · the first line is treated as built</span></h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px">
      <div>${kv([
        ["Length to build",fmtNum(m.ext,0)+" km",RT.kind==="kcic"?fmtNum(RT.extKm,2)+" km published × "+s.alignf.toFixed(2):fmtNum(RT.extKm,0)+" km estimated × "+s.alignf.toFixed(2)],
        ["Construction cost"+refBtn("capex"),usd(m.capex),"L_ext × US$"+s.capex+" M · "+fmtRp(m.capex)],
        ["Yearly payment on construction"+refBtn("wacc"),fmtRp(m.annCap),`capex × CRF(${pct(s.wacc,2)}, ${s.life} yr) = ${pct(crf(s.wacc,s.life),2)}`],
        ["Trainsets needed for the whole line",m.sets+" sets","trips × (ride + 30 min turnaround) ÷ 18 h service day, + 10 % spare · Whoosh owns 11"],
        ["Passengers per year"+refBtn("lf"),fmtNum(m.ridersYr/1e6,1)+" M",`${s.trains} × 2 × 365 × ${SEATS} × ${pct(s.lf)} · end-to-end equivalents`],
      ])}</div>
      <div>${kv([
        ["Fare revenue on the extension",fmtRp(m.rev),"riders × fare × L_ext ÷ L"],
        ["Traction electricity"+refBtn("elec"),fmtRp(m.cEnergy),fmtNum(m.E*m.ext/m.L*m.trainsYr/1e6,0)+" GWh × Rp "+fmtNum(s.elec,0)],
        ["Train operations"+refBtn("opex_train"),fmtRp(m.cTrain),fmtNum(m.trainsYr*m.ext/1e6,1)+" M train-km × US$"+s.opex_train],
        ["Infrastructure maintenance"+refBtn("opex_infra"),fmtRp(m.cInfra),fmtNum(m.ext,0)+" km × US$"+s.opex_infra+"k"],
        ["Operating cost",fmtRp(m.opex),"",true],
        ["Operating surplus",fmtRp(m.rev-m.opex),"revenue − operating cost"],
      ])}</div>
      <div>${kv([
        ["Operating cost covered by fares",pct(m.opRatio),"revenue ÷ operating cost"],
        ["Capital payment covered by surplus",pct(Math.max(0,m.capCover)),"(revenue − opex) ÷ yearly payment"],
        ["Full cost covered by fares",pct(m.cover)+(m.cover>=1?flag("self-funding","ok"):""),"revenue ÷ (opex + yearly payment)",true],
        ["Yearly shortfall",m.cover>=1?"none":fmtRp(m.cost-m.rev),m.cover>=1?"":usd(m.cost-m.rev)+" per year to be found elsewhere"],
        ["Break-even fare, Jakarta–Surabaya",fmtRp(m.beFare),"fare × full cost ÷ revenue, at the same ridership"+(m.beFare>m.fareAir?" · above the average flight fare":"")],
        ["Break-even load factor",m.beLF<=1?pct(m.beLF):"> 100 %"+flag("not reachable","bad"),"at the current fare and train count"],
      ])}</div></div></div>`;

  drawSpeed(m,s);drawD2D(m,s);drawGC(m,s);drawCO2(m,s);drawPatterns(m,s);drawSens(m,s);drawEcon(m,s);drawPeers(m,s);drawMap(m,s);drawRoutes(m,s);
}

// ---------- charts ----------
const C_RAIL="var(--s1)",C_AIR="var(--s2)";
let SP=null; // geometry of the speed chart, for hover
function drawSpeed(m,s){
  const W=1100,l=48,r=16,t=58,b=62,E_H=128,H=364+E_H,pw=W-l-r,ph=364-t-b;
  const ymax=Math.ceil((Math.max(s.vmax,300)+20)/50)*50, X=k=>l+pw*k/m.L, Y=v=>t+ph*(1-v/ymax);
  let g=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Speed profile">`;
  g+=`<rect x="${X(0)}" y="${t}" width="${X(B_KM)-X(0)}" height="${ph}" fill="var(--s1)" opacity=".06"/><rect x="${X(B_KM)}" y="${t}" width="${X(m.L)-X(B_KM)}" height="${ph}" fill="var(--s3)" opacity=".05"/>`;
  for(let v=0;v<=ymax;v+=50)g+=`<line x1="${l}" x2="${W-r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--border)" stroke-width="${v?0.6:1}"/><text x="${l-6}" y="${Y(v)+4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`;
  g+=`<text x="12" y="${t+ph/2}" transform="rotate(-90 12 ${t+ph/2})" text-anchor="middle" font-size="11" fill="var(--muted)">km/h</text>`;
  for(let k=0;k<=m.L;k+=100)g+=`<text x="${X(k)}" y="${t+ph+14}" text-anchor="middle" font-size="11" fill="var(--muted)">${k}</text>`;
  
  // band: the built line and the new one
  const by=t+ph+22,bh=16;
  g+=`<rect x="${X(0)}" y="${by}" width="${X(B_KM)-X(0)-1}" height="${bh}" rx="2" fill="var(--s1)" opacity=".35" data-tip="${RT.skipsBandung?"Built Whoosh line as far as Karawang, "+fmtNum(B_KM,1)+" km":"Built Whoosh line, 142.3 km, alongside the Jakarta–Cikampek and Cipularang toll roads"}"/>${X(B_KM)-X(0)>70?`<text x="${(X(0)+X(B_KM))/2}" y="${by+11.5}" text-anchor="middle" font-size="9.5" fill="var(--text)" pointer-events="none">Whoosh today</text>`:""}`;
  { const x0=X(B_KM),x1=X(m.L);
    g+=`<rect x="${x0.toFixed(1)}" y="${by}" width="${(x1-x0).toFixed(1)}" height="${bh}" rx="2" fill="var(--s3)" opacity=".4" data-tip="${esc(routeTitle(RT)+" · schematic alignment · km "+fmtNum(B_KM,0)+"–"+fmtNum(m.L,0))}"/><text x="${((x0+x1)/2).toFixed(1)}" y="${by+11.5}" text-anchor="middle" font-size="9.5" fill="var(--text)" pointer-events="none">${routeTitle(RT)} · via ${RT.via}</text>`;}
  g+=`<text x="${l}" y="${by+bh+13}" font-size="10.5" fill="var(--muted)">km from Halim · band: built line and the route chosen</text>`;
  // limit and speed
  let lim="",sp="",px=[],pv=[],pt=[];
  m.J.legs.forEach((lg,k)=>{const t0=m.arr[k]+(k?s.dwell*60:0);
    for(let i=0;i<=lg.n;i++){const x=lg.a+(lg.b-lg.a)*i/lg.n;px.push(x);pv.push(lg.v[i]*3.6);pt.push(t0+lg.ts[i]*(1+s.pad));
      lim+=(lim?"L":"M")+X(x).toFixed(1)+" "+Y(lg.lim[i]*3.6).toFixed(1);sp+=(sp?"L":"M")+X(x).toFixed(1)+" "+Y(lg.v[i]*3.6).toFixed(1);}});
  g+=`<path d="${sp}L${X(m.L)} ${Y(0)}L${X(0)} ${Y(0)}Z" fill="var(--s1)" opacity=".13"/><path d="${lim}" fill="none" stroke="var(--muted)" stroke-width="1" stroke-dasharray="4 3"/><path d="${sp}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round"/>`;
  // stations
  // labels: each goes in the lowest of three rows that is still free; one that fits nowhere is left out
  const rowEnd=[-1e9,-1e9,-1e9];
  ST.forEach((x,i)=>{const k=m.idx.indexOf(i),sx=X(m.pos[i]),served=k>=0,anchor=i===0?"start":i===ST.length-1?"end":"middle";
    g+=`<line x1="${sx}" x2="${sx}" y1="${t-4}" y2="${t+ph}" stroke="${served?"var(--text-2)":"var(--muted)"}" stroke-width="${served?1:0.7}" stroke-dasharray="${served?"":"2 4"}" opacity="${served?0.55:0.5}"/>`;
    const name=SHORT[x.id],time=served&&k?fmtHM(m.arr[k]/60):"";let y=t-9,showTime=!!time;
    { const fit=w=>{const x0=anchor==="start"?sx:anchor==="end"?sx-w:sx-w/2,row=rowEnd.findIndex(e=>e+8<=x0);if(row<0)return false;rowEnd[row]=x0+w;y=t-9-14*row;return true;};
      const wn=name.length*(served?6.9:6.1);if(!(time&&fit(wn+31))){showTime=false;if(!fit(wn))return;}}
    g+=`<text x="${sx}" y="${y}" text-anchor="${anchor}" font-size="11.5" font-weight="${served?650:400}" fill="${served?"var(--text)":"var(--muted)"}">${name}${showTime?` <tspan font-weight="400" fill="var(--text-2)">${time}</tspan>`:""}</text>`;});
  // elevation: the ground under the line and the rail level derived from it
  const ey=364+2,eh=E_H-26,raws=[];for(let x=0;x<B_KM;x+=PSTEP)raws.push(x);for(let j=0;j<RT.prof.z.length;j++)raws.push(Math.min(B_KM+RT.extKm,B_KM+j*PSTEP));
  const zs=raws.map(x=>elevAt(RT,x,"z")),rs=raws.map(x=>elevAt(RT,x,"r")),zmax=Math.max(400,Math.ceil(Math.max(...zs)/200)*200),EY=z=>ey+eh*(1-Math.max(0,z)/zmax);
  for(let z=0;z<=zmax;z+=zmax/2)g+=`<line x1="${l}" x2="${W-r}" y1="${EY(z)}" y2="${EY(z)}" stroke="var(--border)" stroke-width="${z?0.6:1}"/><text x="${l-6}" y="${EY(z)+4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmtNum(z,0)}</text>`;
  g+=`<text x="12" y="${ey+eh/2}" transform="rotate(-90 12 ${ey+eh/2})" text-anchor="middle" font-size="11" fill="var(--muted)">m</text>`;
  g+=`<path d="M${X(0)} ${EY(0)}${raws.map((x,i)=>"L"+X(m.km(x)).toFixed(1)+" "+EY(zs[i]).toFixed(1)).join("")}L${X(m.L)} ${EY(0)}Z" fill="#4a4d58" opacity=".55"/>`;
  g+=`<path d="${raws.map((x,i)=>(i?"L":"M")+X(m.km(x)).toFixed(1)+" "+EY(rs[i]).toFixed(1)).join("")}" fill="none" stroke="var(--s4)" stroke-width="1.6" stroke-linejoin="round"/>`;
  g+=`<text x="${l}" y="${ey+eh+15}" font-size="10.5" fill="var(--muted)">${s.grade?"elevation in metres · the train feels the rail level":"elevation in metres · gradients are switched off, the train runs as on level track"}</text>`;
  g+=`<g id="spCur" style="display:none"><line id="spLine" y1="${t}" y2="${ey+eh}" stroke="var(--text)" stroke-width="1" opacity=".6"/><circle id="spDot" r="4.5" fill="var(--s1)" stroke="#fff" stroke-width="1.5"/></g>`;
  g+=`<rect class="hit" id="spHit" x="${l}" y="${t}" width="${pw}" height="${ph}" fill="transparent"/><rect class="hit" id="spHit2" x="${l}" y="${ey}" width="${pw}" height="${eh}" fill="transparent"/></svg>`;
  document.getElementById("chartSpeed").innerHTML=g;
  SP={W,l,pw,X,Y,px,pv,pt,L:m.L};
  const svg=document.getElementById("spHit").ownerSVGElement;
  for(const hit of [document.getElementById("spHit"),document.getElementById("spHit2")]){
  hit.addEventListener("mousemove",e=>{const rc=svg.getBoundingClientRect(),xs=(e.clientX-rc.left)/rc.width*W,k=Math.max(0,Math.min(m.L,(xs-l)/pw*m.L));
    let lo=0,hi=px.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(px[mid]<k)lo=mid;else hi=mid;}
    const i=k-px[lo]<px[hi]-k?lo:hi,raw=px[i]<=B_KM?px[i]:B_KM+(px[i]-B_KM)/s.alignf;
    document.getElementById("spCur").style.display="";const ln=document.getElementById("spLine"),dot=document.getElementById("spDot");
    ln.setAttribute("x1",X(px[i]));ln.setAttribute("x2",X(px[i]));dot.setAttribute("cx",X(px[i]));dot.setAttribute("cy",Y(pv[i]));
    showTip(e,`<b>km ${fmtNum(px[i],0)}</b> · ${fmtNum(pv[i],0)} km/h · ${fmtDur(pt[i]/60)} from Halim<br><span style="color:var(--text-2)">${raw<=B_KM?"built Whoosh line":esc(routeTitle(RT))}</span><br><span style="color:var(--text-2)">rail ${fmtNum(elevAt(RT,raw,"r"),0)} m · ground ${fmtNum(elevAt(RT,raw,"z"),0)} m · gradient ${fmtNum((elevAt(RT,raw+0.25,"r")-elevAt(RT,raw-0.25,"r"))/0.5*(raw<=B_KM?1:1/s.alignf),1)} ‰</span>`);
    moveTrain(raw);});
  hit.addEventListener("mouseleave",()=>{document.getElementById("spCur").style.display="none";hideTip();moveTrain(null);});}
}
const AIRC=["var(--s2)","var(--cgk)"];
function drawD2D(m,s){
  const seg=(d,ride,c)=>[["To the terminal",d.acc,"#6b6c75"],["Waiting",d.pre,"#8d8c84"],[ride,d.ride,c],["Leaving the terminal",d.post,"#a9a79c"],["To the destination",d.egr,"#55565e"]];
  document.getElementById("chartD2D").innerHTML=hbars([{label:"Train",color:C_RAIL,segs:seg(m.d2dRail,"On the train",C_RAIL),total:fmtDur(m.d2dRail.total)},...m.legs.map((l,i)=>({label:"Fly "+l.code,color:AIRC[i],segs:seg(l.d2d,"In the air, "+l.code,AIRC[i]),total:fmtDur(l.d2d.total)}))],v=>fmtDur(v),{inlabel:sg=>fmtNum(sg[1],0)+" min"});
}
function drawGC(m,s){
  const vt=x=>s.vot*x/60;
  document.getElementById("chartGC").innerHTML=hbars([
    {label:"Train",color:C_RAIL,segs:[["Fare: distance",m.fare.parts[0],"#3987e5"],["Fare: time",m.fare.parts[1],"#6aa6ee"],["Fare: stations",m.fare.parts[2],"#9cc4f4"],["Offsets",m.rail.offCost,"var(--s3)"],["Value of time",vt(m.d2dRail.total),"#55565e"]],total:fmtRpM(m.gcRail)},
    ...m.legs.map((l,i)=>({label:"Fly "+l.code,color:AIRC[i],segs:[["Air fare, "+l.code,l.fare,AIRC[i]],["Flight surcharge",m.levy,"var(--s4)"],["Offsets",l.co2.offCost,"var(--s3)"],["Value of time",vt(l.d2d.total),"#55565e"]],total:fmtRpM(l.gcost)}))],v=>fmtRp(v),{inlabel:sg=>fmtNum(sg[1]/1000,0)+"k"});
}
function drawCO2(m,s){
  const rows=[
    {label:"Train",color:C_RAIL,segs:[["Traction electricity",m.rail.trac,"#3987e5"],["Auxiliaries",m.rail.aux,"#6aa6ee"],["Building the line",m.rail.emb,"#8d5a2b"],["Building the trains",m.rail.veh,"#c98500"]],total:fmtKg(m.rail.gross)},
    ...m.legs.map((l,i)=>({label:"Fly "+l.code,color:AIRC[i],segs:[["Jet fuel burned",l.co2.comb,"#d95926"],["Fuel production",l.co2.up,"#e58a63"],["Non-CO₂ effects",l.co2.non,"#d55181"],["Building the aircraft",l.co2.mfg,"#c98500"],["Building the airports",l.co2.apt,"#8d5a2b"]],total:fmtKg(l.co2.gross)}))];
  if(m.offsetOn)rows.push({label:"Train net",color:C_RAIL,segs:[["After offsets",m.rail.net,"#199e70"]],total:fmtKg(m.rail.net)},...m.legs.map((l,i)=>({label:l.code+" net",color:AIRC[i],segs:[["After offsets",l.co2.net,"#199e70"]],total:fmtKg(l.co2.net)})));
  document.getElementById("chartCO2").innerHTML=hbars(rows,v=>fmtKg(v),{inlabel:sg=>fmtNum(sg[1],0),bh:m.offsetOn?20:26,rw:70});
}
function axes(W,H,l,r,t,b,x0,x1,y0,y1,xf,yf,xl,yl){
  const pw=W-l-r,ph=H-t-b,X=v=>l+pw*(v-x0)/(x1-x0),Y=v=>t+ph*(1-(v-y0)/(y1-y0));let g="";
  const xs=niceStep(x1-x0,6),ys=niceStep(y1-y0,5);
  for(let v=Math.ceil(y0/ys)*ys;v<=y1+1e-9;v+=ys)g+=`<line x1="${l}" x2="${W-r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--border)" stroke-width=".6"/><text x="${l-6}" y="${Y(v)+4}" text-anchor="end" font-size="11" fill="var(--muted)">${yf(v)}</text>`;
  for(let v=Math.ceil(x0/xs)*xs;v<=x1+1e-9;v+=xs)g+=`<text x="${X(v)}" y="${t+ph+15}" text-anchor="middle" font-size="11" fill="var(--muted)">${xf(v)}</text>`;
  g+=`<line x1="${l}" x2="${W-r}" y1="${t+ph}" y2="${t+ph}" stroke="var(--border)"/><text x="${l+pw/2}" y="${H-4}" text-anchor="middle" font-size="11" fill="var(--muted)">${xl}</text><text x="12" y="${t+ph/2}" transform="rotate(-90 12 ${t+ph/2})" text-anchor="middle" font-size="11" fill="var(--muted)">${yl}</text>`;
  return {g,X,Y,pw,ph};
}
function drawPatterns(m,s){
  const W=560,H=300,l=56,r=14,t=14,b=40,P=[m.patCur,...m.patRanges.flatMap(q=>[q.lo,q.hi])];
  const ts=P.map(p=>p.T/60),fs=P.map(p=>p.fare/1e6),par=m.parity/60,ff=m.ticketAir/1e6;
  const pad=(a,b2,f)=>[a-(b2-a)*f,b2+(b2-a)*f];
  let [x0,x1]=pad(Math.min(...ts,par),Math.max(...ts,par),0.08),[y0,y1]=pad(Math.min(...fs,ff),Math.max(...fs,ff),0.1);
  if(x1-x0<0.5){x0-=0.25;x1+=0.25;} if(y1-y0<0.1){y0-=0.05;y1+=0.05;}
  const A=axes(W,H,l,r,t,b,x0,x1,y0,y1,v=>fmtHM(v*60),v=>fmtNum(v,2),"Jakarta → Surabaya, h:mm on the train","fare, Rp million");
  let g=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">`+A.g;
  const cx=Math.max(l,Math.min(W-r,A.X(par))),cy=Math.max(t,Math.min(t+A.ph,A.Y(ff)));
  g+=`<rect x="${l}" y="${cy}" width="${cx-l}" height="${t+A.ph-cy}" fill="var(--s3)" opacity=".1"/>`;
  if(par>x0&&par<x1)g+=`<line x1="${cx}" x2="${cx}" y1="${t}" y2="${t+A.ph}" stroke="var(--s2)" stroke-dasharray="5 4"/><text x="${cx-l>150?cx-5:cx+5}" y="${t+11}" text-anchor="${cx-l>150?"end":"start"}" font-size="10.5" fill="var(--s2)">ties the average flight door to door</text>`;
  if(ff>y0&&ff<y1)g+=`<line x1="${l}" x2="${W-r}" y1="${cy}" y2="${cy}" stroke="var(--s2)" stroke-dasharray="5 4"/><text x="${W-r-4}" y="${cy-5}" text-anchor="end" font-size="10.5" fill="var(--s2)">average flight fare</text>`;
  if(cx-l>120&&t+A.ph-cy>24)g+=`<text x="${l+6}" y="${t+A.ph-7}" font-size="10.5" fill="var(--s3)">faster and cheaper than flying</text>`;
  const SH=["#b4d2f7","#9cc4f4","#7fb3f1","#62a2ee","#4a93ea","#3987e5","#2a78d8","#1f66bd","#174f94"],col=n=>SH[Math.round((n-N_MUST)/OPT.length*8)];
  const what=p=>p.names.length?p.names.join(", "):"no optional stops",pt=p=>A.X(p.T/60).toFixed(1)+" "+A.Y(p.fare/1e6).toFixed(1);
  m.patRanges.forEach(q=>{const one=q.hi.T-q.lo.T<1e-6,tip=q.c+" optional stops · "+(one?what(q.lo)+" · "+fmtDur(q.lo.T)+" · "+fmtRp(q.lo.fare):"fastest "+fmtDur(q.lo.T)+": "+what(q.lo)+" · slowest "+fmtDur(q.hi.T)+": "+what(q.hi)+" · "+fmtRp(q.lo.fare)+"–"+fmtRp(q.hi.fare));
    g+=`<path d="M${pt(q.lo)}L${pt(q.hi)}" fill="none" stroke="${col(q.lo.n)}" stroke-width="8" stroke-linecap="round" opacity=".85" data-tip="${esc(tip)}"/>`;});
  const c=m.patCur;g+=`<circle cx="${A.X(c.T/60).toFixed(1)}" cy="${A.Y(c.fare/1e6).toFixed(1)}" r="7" fill="${col(c.n)}" stroke="#fff" stroke-width="2" data-tip="${esc("Current: "+what(c)+" · "+fmtDur(c.T)+" · "+fmtRp(c.fare))}"/>`;
  g+=`</svg><div class="legend"><span><i style="background:#b4d2f7;border-radius:50%"></i>express</span><span><i style="background:#174f94;border-radius:50%"></i>all stops</span><span><i style="background:#3987e5;border:2px solid #fff;border-radius:50%"></i>current pattern</span><span>Each bar runs from the fastest to the slowest pattern with that many stops; they nearly coincide, because each stop costs about the same.</span></div>`;
  document.getElementById("chartPatterns").innerHTML=g;
}
function drawSens(m,s){
  const W=560,H=300,l=56,r=14,t=14,b=40,pars=m.legs.map(l=>l.parity/60),ys=m.sens.map(p=>p[1]/60);
  const y0=Math.min(...ys,...pars)-0.3,y1=Math.max(...ys,...pars)+0.3;
  const A=axes(W,H,l,r,t,b,200,400,y0,y1,v=>v,v=>fmtHM(v*60),"line speed, km/h","Jakarta → Surabaya, h:mm");
  let g=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">`+A.g;
  m.legs.forEach((lg,i)=>{const par=pars[i],y=A.Y(par);g+=`<rect x="${l}" y="${y}" width="${A.pw}" height="${t+A.ph-y}" fill="var(--s3)" opacity=".07"/><line x1="${l}" x2="${W-r}" y1="${y}" y2="${y}" stroke="${AIRC[i]}" stroke-dasharray="5 4"/><text x="${W-r-4}" y="${y-5}" text-anchor="end" font-size="10.5" fill="${AIRC[i]}">ties the ${lg.code} flight door to door · ${fmtDur(lg.parity)}</text>`;});
  g+=`<path d="${m.sens.map((p,i)=>(i?"L":"M")+A.X(p[0]).toFixed(1)+" "+A.Y(p[1]/60).toFixed(1)).join("")}" fill="none" stroke="var(--s1)" stroke-width="2"/>`;
  m.sens.forEach(p=>{g+=`<circle cx="${A.X(p[0]).toFixed(1)}" cy="${A.Y(p[1]/60).toFixed(1)}" r="${p[0]===s.vmax?6:3}" fill="var(--s1)" ${p[0]===s.vmax?'stroke="#fff" stroke-width="2"':""} data-tip="${p[0]} km/h · ${fmtDur(p[1])}"/>`;});
  const need=m.legs.map(lg=>{const p=m.sens.find(q=>q[1]<=lg.parity);return `<b style="color:var(--text)">${lg.code}</b>: ${p?"from "+p[0]+" km/h":"not below 400 km/h"}`;});
  g+=`</svg><div class="legend"><span>Line speed at which rail matches the flight door to door with these stops — ${need.join(" · ")}.</span></div>`;
  document.getElementById("chartSens").innerHTML=g;
}
function drawEcon(m,s){
  document.getElementById("chartEcon").innerHTML=hbars([
    {label:"Cost",segs:[["Yearly payment on construction",m.annCap,"#8d5a2b"],["Train operations",m.cTrain,"#9085e9"],["Infrastructure maintenance",m.cInfra,"#c98500"],["Electricity",m.cEnergy,"#d55181"]],total:fmtRp(m.cost).replace(" trillion"," T").replace(" billion"," B")},
    {label:"Revenue",segs:[["Fares",m.rev,"#199e70"]],total:fmtRp(m.rev).replace(" trillion"," T").replace(" billion"," B")}],v=>fmtRp(v),{lw:66,rw:96});
}

// ---------- comparable lines ----------
// km = length of the high-speed route; min = fastest scheduled train; v = top speed in service; share = rail ÷ (rail + air), with year. Sources in REFS.sec_peers.
const PEERS=[
 {n:"Madrid–Barcelona",c:"Spain",km:621,min:150,v:"300",share:0.815,sy:2024,w:"Madrid–Barcelona_high-speed_rail_line"},
 {n:"Berlin–Munich",c:"Germany",km:623,min:235,v:"300",share:0.61,sy:2018,w:"Berlin–Munich_high-speed_railway"},
 {n:"Rome–Milan",c:"Italy",km:567,min:170,v:"300",share:0.76,sy:2018,w:"High-speed_rail_in_Italy"},
 {n:"Tokyo–Shin-Aomori",c:"Japan",km:675,min:178,v:"320",w:"Tōhoku_Shinkansen"},
 {n:"Paris–Marseille",c:"France",km:750,min:185,v:"300",share:0.69,sy:2006,w:"LGV_Méditerranée"},
 {n:"Tokyo–Hiroshima",c:"Japan",km:821,min:227,v:"300",share:0.61,sy:2025,w:"San'yō_Shinkansen"},
 {n:"Harbin–Dalian",c:"China",km:921,min:210,v:"300",w:"Harbin–Dalian_high-speed_railway"},
 {n:"Wuhan–Guangzhou",c:"China",km:968,min:204,v:"350",w:"Wuhan–Guangzhou_high-speed_railway"},
 {n:"Tokyo–Fukuoka",c:"Japan",km:1069,min:286,v:"300",share:0.09,sy:2025,w:"Tokaido_Shinkansen"},
 {n:"Beijing–Shanghai",c:"China",km:1318,min:258,v:"350",w:"Beijing–Shanghai_high-speed_railway"},
];
const PEER_COST=[["Harbin–Dalian",17],["Wuhan–Guangzhou",18],["Spain, average",20],["China, typical",19],["Beijing–Shanghai",26],["Europe, typical",32],["Vietnam N–S (approved)",43],["Jakarta–Bandung",51],["California phase 1 (estimate)",159]];
const shareRule=h=>1/(1+Math.exp(1.1*(h-3.9)));
function drawPeers(m,s){
  const me={n:"Jakarta–Surabaya, this model",c:"Indonesia",km:m.L,min:m.Tmin,v:String(s.vmax),share:m.share,me:true};
  const rows=[...PEERS,me].sort((a,b)=>a.km-b.km), near=PEERS.filter(p=>p.km>=650&&p.km<=1000), spd=p=>p.km/(p.min/60);
  const avgNear=near.reduce((a,p)=>a+spd(p),0)/near.length, faster=PEERS.filter(p=>spd(p)>m.avg).map(p=>p.n);
  let h=`<div class="cmpwrap"><table class="cmp"><tr><th>City pair</th><th>Length</th><th>Fastest train</th><th>Average speed</th><th>Top speed</th><th>Rail share vs air</th><th>Rule of thumb</th></tr>`;
  for(const p of rows)h+=`<tr${p.me?' class="me"':''}><td>${p.w?`<a href="${W_+p.w}" target="_blank" rel="noopener">${p.n}</a>`:p.n} <small>${p.c}</small></td><td>${fmtNum(p.km,0)} km</td><td>${fmtDur(p.min)}</td><td>${fmtNum(spd(p),0)} km/h</td><td>${p.v} km/h</td><td>${p.me?"–":p.share!=null?pct(p.share)+` <small>${p.sy}</small>`:"n/a"}</td><td>${pct(shareRule(p.min/60))}</td></tr>`;
  h+=`</table></div><div class="legend"><span>Lines of 650–1,000 km average <b style="color:var(--text)">${fmtNum(avgNear,0)} km/h</b> end to end on their fastest train; this model gives <b style="color:var(--text)">${fmtNum(m.avg,0)} km/h</b> with ${m.nStops-2} intermediate stops.</span><span>${faster.length?"Faster in service today: "+faster.join(", "):"No line in this list is faster in service today, which is a reason to doubt the timetable margin or the line speed."}</span><span>"Rule of thumb" is the share this model's curve would predict from the train time alone.</span></div>`;
  document.getElementById("peers").innerHTML=h;
  // rail share against train time
  { const W=560,H=300,l=48,r=14,t=14,b=40,A=axes(W,H,l,r,t,b,2,5.5,0,1,v=>fmtHM(v*60),v=>pct(v),"fastest train, h:mm","rail share of rail + air");
    let g=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">`+A.g,d="";
    for(let x=2;x<=5.5001;x+=0.05)d+=(d?"L":"M")+A.X(x).toFixed(1)+" "+A.Y(shareRule(x)).toFixed(1);
    g+=`<path d="${d}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    const left={"Berlin–Munich":1,"Rome–Milan":1,"Madrid–Barcelona":0,"Tokyo–Fukuoka":1};
    PEERS.filter(p=>p.share!=null).forEach(p=>{const x=A.X(p.min/60),y=A.Y(p.share),lf=left[p.n];
      g+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="var(--s4)" data-tip="${esc(p.n+" · "+fmtDur(p.min)+" · rail "+pct(p.share)+" ("+p.sy+")")}"/><text x="${(x+(lf?-8:8)).toFixed(1)}" y="${(y+(p.n==="Paris–Marseille"?17:4)).toFixed(1)}" text-anchor="${lf?"end":"start"}" font-size="10.5" fill="var(--text-2)">${p.n}</text>`;});
    const mx=Math.max(2,Math.min(5.5,m.Tmin/60));
    g+=`<circle cx="${A.X(mx).toFixed(1)}" cy="${A.Y(m.share).toFixed(1)}" r="7" fill="var(--s1)" stroke="#fff" stroke-width="2" data-tip="${esc("Jakarta–Surabaya, modeled · "+fmtDur(m.Tmin)+" · rule of thumb "+pct(m.share))}"/>`;
    g+=`</svg><div class="legend"><span><i style="background:var(--s4);border-radius:50%"></i>real corridor</span><span><i style="background:var(--s1);border:2px solid #fff;border-radius:50%"></i>Jakarta–Surabaya, modeled</span><span><i class="ln" style="background:var(--muted)"></i>curve used by this model</span><span>Berlin–Munich and Tokyo–Hiroshima sit about 10 points above the curve and Tokyo–Fukuoka nearly 20 below it: frequency, fares and airport access matter as well as time.</span></div>`;
    document.getElementById("chartShare").innerHTML=g; }
  // construction cost per km
  { const rowsC=[...PEER_COST.map(([n,v])=>({label:n,segs:[["Reported cost",v,"#6b6c75"]]})),{label:"This model",color:C_RAIL,segs:[["Slider value",s.capex,C_RAIL]]}].sort((a,b)=>a.segs[0][1]-b.segs[0][1]);
    document.getElementById("chartCapex").innerHTML=hbars(rowsC,v=>"$"+fmtNum(v,v<20?1:0)+" M",{lw:190,rw:60,bh:17}); }
}

// ---------- map ----------
// Self-drawn: Natural Earth coastline + route geometry, equirectangular projection scaled for 7° S.
const MAPV={W:1000,lo0:105.75,lo1:113.75,la1:-5.55,la0:-8.75};
MAPV.kx=MAPV.W/(MAPV.lo1-MAPV.lo0);MAPV.ky=MAPV.kx/Math.cos(7.2*Math.PI/180);MAPV.H=Math.round((MAPV.la1-MAPV.la0)*MAPV.ky);
const MX=lon=>(lon-MAPV.lo0)*MAPV.kx, MY=lat=>(MAPV.la1-lat)*MAPV.ky;
function posAt(raw){const ln=RT.line;let lo=0,hi=ln.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(ln[mid][2]<raw)lo=mid;else hi=mid;}const a=ln[lo],b=ln[hi],f=b[2]>a[2]?Math.max(0,Math.min(1,(raw-a[2])/(b[2]-a[2]))):0;return [a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1])];}
const MAP_STATIC=(()=>{
  const {W,H}=MAPV,A=ROUTE.airports;
  let g=`<rect width="${W}" height="${H}" fill="#0b0d12"/>`;
  g+=`<path d="${ROUTE.land.map(r=>r.map((p,i)=>(i?"L":"M")+MX(p[0]).toFixed(1)+" "+MY(p[1]).toFixed(1)).join("")+"Z").join("")}" fill="#1b1e25" stroke="#3a3d47" stroke-width="1" stroke-linejoin="round"/>`;
  g+=`<text x="${MX(109.6)}" y="${MY(-5.95)}" text-anchor="middle" font-size="13" font-style="italic" fill="#4b4e59" letter-spacing="3">JAVA SEA</text><text x="${MX(109.2)}" y="${MY(-8.5)}" text-anchor="middle" font-size="13" font-style="italic" fill="#4b4e59" letter-spacing="3">INDIAN OCEAN</text>`;
  g+=`<text x="${MX(107.35)}" y="${MY(-7.32)}" text-anchor="middle" font-size="11" fill="#5d606b" letter-spacing="2">WEST JAVA</text><text x="${MX(109.75)}" y="${MY(-7.42)}" text-anchor="middle" font-size="11" fill="#5d606b" letter-spacing="2">CENTRAL JAVA</text><text x="${MX(112.25)}" y="${MY(-7.98)}" text-anchor="middle" font-size="11" fill="#5d606b" letter-spacing="2">EAST JAVA</text>`;
  const sb=100/ (111.32*Math.cos(7.2*Math.PI/180))*MAPV.kx;
  g+=`<g transform="translate(${W-sb-18},${H-16})"><path d="M0 -5V0H${sb.toFixed(1)}V-5" fill="none" stroke="var(--muted)"/><text x="${(sb/2).toFixed(1)}" y="-5" text-anchor="middle" font-size="10.5" fill="var(--muted)">100 km</text></g>`;
  g+=`<line x1="${MX(A.CGK.lon)}" y1="${MY(A.CGK.lat)}" x2="${MX(A.SUB.lon)}" y2="${MY(A.SUB.lat)}" stroke="var(--cgk)" stroke-width="2" stroke-dasharray="7 6" data-tip="CGK–SUB flight · ${fmtNum(GC_CGK,0)} km great circle"/>`;
  g+=`<path d="${ROUTE.whoosh.map((p,i)=>(i?"L":"M")+MX(p[0]).toFixed(1)+" "+MY(p[1]).toFixed(1)).join("")}" fill="none" stroke="var(--s1)" stroke-width="2.5" stroke-linejoin="round" opacity=".4" data-tip="Built Whoosh line, 142.3 km"/>`;
  g+=`<line x1="${MX(A.HLP.lon)}" y1="${MY(A.HLP.lat)}" x2="${MX(A.SUB.lon)}" y2="${MY(A.SUB.lat)}" stroke="var(--s2)" stroke-width="2" stroke-dasharray="7 6" data-tip="HLP–SUB flight · ${fmtNum(GC_KM,0)} km great circle"/>`;
  let air=`<g data-tip="${esc(A.HLP.name)} airport"><circle cx="${MX(A.HLP.lon)}" cy="${MY(A.HLP.lat)}" r="4.5" fill="#0b0d12" stroke="var(--s2)" stroke-width="2"/><text x="${MX(A.HLP.lon)-9}" y="${MY(A.HLP.lat)+15}" text-anchor="end" font-size="10.5" font-weight="600" fill="var(--s2)">HLP</text></g>`;
  air+=`<g data-tip="${esc(A.CGK.name)} airport"><circle cx="${MX(A.CGK.lon)}" cy="${MY(A.CGK.lat)}" r="4.5" fill="#0b0d12" stroke="var(--cgk)" stroke-width="2"/><text x="${MX(A.CGK.lon)-9}" y="${MY(A.CGK.lat)-6}" text-anchor="end" font-size="10.5" font-weight="600" fill="var(--cgk)">CGK</text></g>`;
  air+=`<g data-tip="${esc(A.SUB.name)} airport"><circle cx="${MX(A.SUB.lon)}" cy="${MY(A.SUB.lat)}" r="4.5" fill="#0b0d12" stroke="var(--s2)" stroke-width="2"/><text x="${MX(A.SUB.lon)+9}" y="${MY(A.SUB.lat)+4}" font-size="10.5" font-weight="600" fill="var(--s2)">SUB</text></g>`;
  return {base:g,air};
})();
// Route lines: the other routes thin and clickable, the chosen one on top. Cached per route.
const MAP_LINES={};
function mapLines(){
  if(MAP_LINES[RT.id])return MAP_LINES[RT.id];
  const path=(ln,a,b)=>ln.filter(p=>p[2]>=a&&p[2]<=b).map((p,i)=>(i?"L":"M")+MX(p[0]).toFixed(1)+" "+MY(p[1]).toFixed(1)).join("");
  let g="";
  for(const r of ROUTES){if(r===RT)continue;const d=path(r.line,r.builtKm,1e9);
    g+=`<g data-route="${r.id}" style="cursor:pointer" data-tip="${esc(routeTitle(r)+" · via "+r.via+" · "+extKmText(r)+" · click to switch to this route")}"><path d="${d}" fill="none" stroke="#7d808c" stroke-width="1.6" stroke-dasharray="5 4" stroke-linejoin="round" opacity=".75"/><path d="${d}" fill="none" stroke="transparent" stroke-width="12"/></g>`;}
  g+=`<path d="${path(RT.line,B_KM,1e9)}" fill="none" stroke="var(--s3)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><path d="${path(RT.line,0,B_KM)}" fill="none" stroke="var(--s1)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  return MAP_LINES[RT.id]=g;
}
function moveTrain(raw){const t=document.getElementById("mapTrain");if(!t)return;if(raw==null){t.style.display="none";return;}const p=posAt(raw);t.setAttribute("cx",MX(p[0]));t.setAttribute("cy",MY(p[1]));t.style.display="";}
function drawMap(m,s){
  document.getElementById("mapFacts").innerHTML=kv([
    [RT.skipsBandung?"Built line used, as far as Karawang":"Built line",fmtNum(B_KM,1)+" km"],
    [RT.kind==="kcic"?"Extension · "+RT.name:"New line, estimated",fmtNum(m.ext,RT.kind==="kcic"?1:0)+" km"],
    ["Jakarta → Surabaya by rail",fmtNum(m.L,0)+" km","",true],
    ["HLP → SUB great circle",fmtNum(GC_KM,0)+" km"],
    ["CGK → SUB great circle",fmtNum(GC_CGK,0)+" km"],
    ["Rail detour over the HLP–SUB straight line",pct(m.L/GC_KM-1)],
    ["Stops served",m.nStops+" of "+ST.length],
  ]);
  const above={jakarta:1,karawang:0,padalarang:1,bandung:0,cirebon:1,tegal:0,pekalongan:1,mojokerto:0,semarang:1,surakarta:0,madiun:0,surabaya:1};
  let g=`<svg viewBox="0 0 ${MAPV.W} ${MAPV.H}" width="100%" role="img" aria-label="Map of Java with the route">`+MAP_STATIC.base+mapLines()+MAP_STATIC.air;
  // labels: the served stops are placed first, each on the side that is free; a label that fits nowhere is left to the tooltip
  const lab={};
  { const boxes=[],order=ST.map((x,i)=>i).sort((a,b)=>(ST[b].must-ST[a].must)||((m.idx.indexOf(b)>=0)-(m.idx.indexOf(a)>=0))||a-b);
    const free=(x0,x1,y0,y1)=>x0>=2&&x1<=MAPV.W-2&&!boxes.some(q=>x0<q[1]&&x1>q[0]&&y0<q[3]&&y1>q[2]);
    ST.forEach(x=>{const cx=MX(x.lon),cy=MY(x.lat);boxes.push([cx-7,cx+7,cy-7,cy+7]);});
    for(const i of order){const x=ST[i],k=m.idx.indexOf(i),cx=MX(x.lon),cy=MY(x.lat),wn=SHORT[x.id].length*(k>=0?7.6:6.9),up=above[x.id]??(i%2);
      // candidates: above or below (preferred side first), then beside; with the arrival time if it fits, else without
      const spots=w=>[[cx-w/2,up?cy-25:cy+11,0,up?-13:22,"middle"],[cx-w/2,up?cy+11:cy-25,0,up?22:-13,"middle"],[cx+10,cy-7,10,4.5,"start"],[cx-10-w,cy-7,-10,4.5,"end"]];
      place:for(const [w,time] of k>0?[[wn+34,true],[wn,false]]:[[wn,false]])for(const [x0,y0,dx,dy,anchor] of spots(w))if(free(x0,x0+w,y0,y0+14)){boxes.push([x0,x0+w,y0,y0+14]);lab[x.id]={dx,dy,anchor,time};break place;}}}
  ST.forEach((x,i)=>{const k=m.idx.indexOf(i),served=k>=0,cx=MX(x.lon),cy=MY(x.lat),L=lab[x.id];
    const tip=`${x.name} · km ${fmtNum(m.pos[i],0)} · ${served?(k?"arrives "+fmtHM(m.arr[k]/60)+" · fare from Jakarta "+fmtRp(m.fares[k].total):"departure"):"trains pass without stopping"}${x.off?" · "+x.off+" km from the city centre":""}${x.reserve?" · reserve station in the study":x.inferred?" · inferred, not on the study's map":""}${x.must?"":" · click to "+(served?"skip":"serve")}`;
    g+=`<g data-tip="${esc(tip)}" ${x.must?"":`data-toggle="${x.id}" style="cursor:pointer"`}><circle cx="${cx}" cy="${cy}" r="13" fill="transparent"/>`+
      (served?`<circle cx="${cx}" cy="${cy}" r="6.5" fill="#fff" stroke="${x.built?"var(--s1)":"var(--s3)"}" stroke-width="3"/>`:`<circle cx="${cx}" cy="${cy}" r="4.5" fill="#0b0d12" stroke="var(--muted)" stroke-width="1.5"/>`)+
      (L?`<text x="${cx+L.dx}" y="${cy+L.dy}" text-anchor="${L.anchor}" font-size="13" font-weight="${served?650:400}" fill="${served?"var(--text)":"var(--muted)"}" stroke="#0b0d12" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">${SHORT[x.id]}${L.time?` <tspan font-weight="400" fill="var(--text-2)">${fmtHM(m.arr[k]/60)}</tspan>`:""}</text>`:"")+`</g>`;});
  g+=`<circle id="mapTrain" r="7" fill="var(--s1)" stroke="#fff" stroke-width="2.5" style="display:none" pointer-events="none"/></svg>`;
  const el=document.getElementById("map");el.innerHTML=g;
  el.querySelectorAll("[data-toggle]").forEach(n=>n.addEventListener("click",()=>toggleStop(n.dataset.toggle)));
  el.querySelectorAll("[data-route]").forEach(n=>n.addEventListener("click",()=>{hideTip();setRoute(n.dataset.route);}));
}

// ---------- the routes side by side ----------
// Each route under the current sliders: the new line alone calling at every station (what the published times most plausibly describe), and Jakarta → Surabaya express and with the route's main stops.
function drawRoutes(m,s){
  const tr=m.tr;
  const rows=ROUTES.map(r=>{const st=r.stations,B=r.builtKm,ext=r.extKm*s.alignf,L=B+ext,Z=zonesFor(r,L),GR=s.grade?(r===RT?m.G:gradeCells(r,s.alignf)):null,pos=st.map(x=>x.km<=B?x.km:B+(x.km-B)*s.alignf);
    const T=idx=>{let t=0;for(let k=1;k<idx.length;k++)t+=simLeg(pos[idx[k-1]],pos[idx[k]],tr,Z,false,GR).t;return (t*(1+s.pad)+s.dwell*60*(idx.length-2))/60;};
    const all=st.map((x,i)=>i),ib=st.reduce((a,x,i)=>x.built?i:a,0);
    return {r,ext,newLine:T(all.filter(i=>i>=ib&&!st[i].reserve)),express:T(all.filter(i=>st[i].must)),main:T(all.filter(i=>st[i].must||r.def.includes(st[i].id))),capex:ext*s.capex*1e6};});
  let h=`<div class="cmpwrap"><table class="cmp routes"><tr><th>Route</th><th>New line</th><th>In tunnel</th><th>Stations</th><th>Published time</th><th>Modeled, all stops</th><th>Jakarta–Surabaya, express</th><th>Main stops</th><th>Construction</th></tr>`;
  ROUTES.forEach((r,i)=>{const q=rows[i],cur=r===RT;
    if(!i||ROUTES[i-1].kind!==r.kind)h+=`<tr class="grp"><td colspan="9">${ROUTE_GROUP[r.kind]}</td></tr>`;
    h+=`<tr class="${cur?"me":"pick"}" ${cur?"":`data-route="${r.id}" title="Switch to this route"`}><td>${routeTitle(r)} <small>via ${r.via}${r.skipsBandung?" · skips Bandung":""}</small></td><td>${fmtNum(q.ext,r.kind==="kcic"?1:0)} km</td><td>${r.pub?fmtNum(r.pub.tunnelKm,2)+" km":"–"}</td><td>${r.nStations}${r.nReserve?` <small>+ ${r.nReserve}</small>`:""}</td><td>${r.pub?fmtDur(r.pub.min):"–"}</td><td>${fmtDur(q.newLine)}${r.pub?` <small>${q.newLine>=r.pub.min?"+":"−"}${pct(Math.abs(q.newLine/r.pub.min-1))}</small>`:""}</td><td>${fmtDur(q.express)}</td><td>${fmtDur(q.main)}</td><td>${fmtUSD(q.capex)}</td></tr>`;});
  h+=`</table></div><div class="legend"><span>Published: KCIC's pre-feasibility study of 2024, measured from Tegalluar. It does not say which stations the published time calls at. "Modeled, all stops" is this model's time over the new line only, from where it leaves the built one, calling at every station except the reserve ones; the percentage is its gap to the published time.</span><span>Stations are the new ones, Surabaya included; reserve stations follow the plus sign. Lengths include the alignment slider. One cost per km is applied to every route, whatever its share of tunnel.</span></div>`;
  const el=document.getElementById("routeCmp");el.innerHTML=h;
  el.querySelectorAll("[data-route]").forEach(n=>n.addEventListener("click",()=>setRoute(n.dataset.route)));
}

// ---------- notes ----------
const NOTES=()=>[
 RT.kind==="kcic"?`<b>Route.</b> The built line (Halim → Tegalluar, 142.3 km) uses the real track geometry. The extension is alternative ${RT.alt} of KCIC's pre-feasibility study, <span class="notr">${RT.name} via ${RT.via}</span>: ${fmtNum(RT.pub.km,2)} km from Tegalluar to Surabaya, ${fmtNum(RT.pub.tunnelKm,2)} km of it in tunnel, ${RT.pub.stations} stations and ${RT.pub.reserve} in reserve, ${RT.pub.min} minutes. The study's map names the stations but is a sketch, not a surveyed alignment, so the line here is a smooth curve through them, ${fmtNum(RT.drawnKm,0)} km as drawn, with distances stretched to the published length. Each station sits where the curve passes closest to its town centre. Stations labelled in green on the map are taken to be the reserve ones; here they are optional stops like any other. The Surabaya terminus is put at Waru, on the southern edge of the city; that is an assumption, because the map places it only roughly.`
 :`<b>Route.</b> ${RT.skipsBandung?`The built line is used from Halim as far as Karawang (${fmtNum(B_KM,1)} km, real track geometry), and Bandung is not served.`:"The built line (Halim → Tegalluar, 142.3 km) uses the real track geometry."} The new line joins corridors drawn on the map of KCIC's pre-feasibility study, which also shows the north-coast corridor of JICA's semi-high-speed study: <span class="notr">${RT.name}, via ${RT.via}</span>. This combination is not an alternative of either study. Its length of ${fmtNum(RT.extKm,0)} km is an estimate: ${fmtNum(RT.drawnKm,0)} km as drawn plus ${pct(RT.stretch-1)}, the stretch that fits KCIC's three published lengths on average. Stations on KCIC's corridors are the ones on its map; those marked inferred, on JICA's corridor, are this page's guess. ${RT.terminus==="pasarturi"?"The line ends at Pasar Turi, the terminus of the north-coast main line, in the centre of Surabaya.":"The Surabaya terminus is put at Waru, on the southern edge of the city."}${RT.jica?` JICA studied this corridor for trains of about 160 km/h: ${RT.jica.km} km from Jakarta, ${RT.jica.passenger} passenger stations, ${fmtNum(RT.jica.min/60,1)} hours.`:""}`,
 `<b>Running time.</b> Each run between stops is integrated in ${DS*1000} m steps. Acceleration is the smaller of the starting acceleration and what traction power leaves after resistance: a = (P/v − R(v)) ÷ (1.04·m). Braking is at a constant rate. Speed is capped at the line speed, and at the city limit within ${ZONE_KM} km of Halim, of the Surabaya terminus and, on routes through Bandung, of Tegalluar. The timetable adds a percentage margin to running time and a fixed dwell at each intermediate stop.`,
 `<b>Resistance and energy.</b> R = W·(0.79 + 0.0064·V + 0.000076·V²) newtons per kilonewton of train weight, V in km/h. The quadratic term is fitted so that cruising at 350 km/h draws about ${fmtNum(cruise350()[0],0)} kWh per km at the wire, about ${fmtNum(cruise350()[1],0)} Wh per seat-km, with the default mass and drivetrain efficiency and before auxiliaries; the Fuxing is reported at 38 Wh per passenger-km at that speed. Energy at the wire is traction work ÷ drivetrain efficiency, minus recovered braking energy, plus auxiliaries for the whole trip. With gradients switched on, gravity along the modeled rail level is added to the resistance, and the energy is the mean of the eastbound and westbound runs. Tunnels, wind and curve resistance are ignored.`,
 `<b>Fare.</b> Today's Jakarta–Bandung fare F₀ is split into three parts: one that grows with distance^β, one that grows with travel time, and one that grows with the number of stations served. Fare = F₀ × [d·(L ÷ 142.3)^β + t·(T ÷ T₀) + s·(N ÷ 4)], where T₀ is the modeled time of today's Halim–Karawang–Padalarang–Tegalluar service. With β = 1 and no time or station share this is a plain per-km extrapolation. Stops enter through T and N. This is a cost-shaped estimate, not a forecast of what KCIC would charge; the actual fare today is set by demand and does not recover the cost of the first line.`,
 `<b>Flights.</b> Two legs into Juanda: from Halim Perdanakusuma (${fmtNum(GC_KM,0)} km great circle) and from Soekarno–Hatta (${fmtNum(GC_CGK,0)} km). Each has its own fare, block time and city-to-airport time; check-in, baggage and the Surabaya end are shared. Verdicts, the carbon payback and the charts' reference lines use the average weighted by the share of flights from each airport. The fare is an input because it varies several-fold by airline, season and booking time within the regulated band. Fuel = fixed take-off and landing fuel + cruise burn × distance flown. CO₂ = fuel × 3.16 kg/kg, times a life-cycle multiplier for fuel production, with an optional multiplier for non-CO₂ warming applied to combustion only.`,
 `<b>Traveller's verdict.</b> Generalised cost = ticket + flight surcharge, if one is set + offset surcharge + value of time × door-to-door hours. The train wins below 90 % of the flight's generalised cost and loses above 110 %. Comfort, reliability, luggage, frequency and the chance of working on board are not priced. The market-share figure is a separate rule of thumb based only on the length of the train ride.`,
 `<b>Investor's verdict.</b> Only the new line is costed. Revenue is riders × fare × the extension's share of the route length, with riders = trains × seats × load factor, counted as end-to-end equivalents. Costs are traction electricity, a per-train-km operating cost, a per-km maintenance cost, and the construction cost turned into a level yearly payment with a capital recovery factor. Land acquisition risk, construction delay, ramp-up years, non-fare income, tax and the debt of the first line are not modeled. Ridership is an input; it is not derived from the fare or the travel time.`,
 `<b>Planet's verdict.</b> CO₂e per passenger after offsets, train against flight, with ±15 % counted as no clear winner. The train carries the electricity it uses at the grid's intensity plus a share of the carbon emitted to build the whole line, spread over the carbon accounting period and all riders, plus the trainsets over 30 years. The flight carries a share of building the aircraft (over 40,000 flights) and the two airports. Carbon payback counts only riders who would otherwise have flown, credits the avoided fuel and aircraft but not the airports, which already exist, and charges the train its electricity and trainsets.`,
 `<b>Offsets.</b> When switched on, both modes buy credits for the chosen share of their gross emissions at one price, and the cost is added to each ticket. Only share × integrity is taken off the emissions shown, so cheap low-integrity credits change the price a little and the verdict less. Because both modes offset the same share, their ratio does not change; offsets matter here through the surcharge, which is larger for whichever mode emits more.`,
 `<b>Not modeled.</b> What separates the routes besides length and stops: terrain, tunnels and viaducts (one cost per km is applied to all of them) and the population each would serve. Also a Surabaya terminus nearer the centre, track capacity and mixed stopping patterns on one line, competition from the toll roads themselves and from conventional trains, future aircraft and fuel, and the grid getting cleaner over the asset life.`,
];

// ---------- tooltip, modal ----------
const tipEl=()=>document.getElementById("tip");
function showTip(e,html){const t=tipEl();t.innerHTML=html;t.style.display="block";const w=t.offsetWidth,h=t.offsetHeight;t.style.left=Math.min(window.innerWidth-w-8,e.clientX+14)+"px";t.style.top=Math.max(8,e.clientY-h-12)+"px";}
function hideTip(){tipEl().style.display="none";}
document.addEventListener("mousemove",e=>{const t=e.target.closest&&e.target.closest("[data-tip]");if(t)showTip(e,esc(t.getAttribute("data-tip")));else if(!(e.target.classList&&e.target.classList.contains("hit")))hideTip();});
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest(".ref");if(b){e.preventDefault();e.stopPropagation();openRefs(b.dataset.ref);}});
document.getElementById("modal").addEventListener("click",e=>{if(e.target.id==="modal")closeRefs();});
document.getElementById("mclose").addEventListener("click",closeRefs);
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeRefs();});

// ---------- permalink ----------
let urlTimer=null;
function scheduleURL(){clearTimeout(urlTimer);urlTimer=setTimeout(writeURL,200);}
function writeURL(){
  const q=new URLSearchParams();
  if(RT.id!==ROUTE_DEF)q.set("route",RT.id);
  const cur=OPT.filter(x=>stops.has(x)),def=OPT.filter(x=>DEFAULT_STOPS.includes(x));
  if(cur.join()!==def.join())q.set("stops",cur.length?cur.join(","):"none");
  CTLS.forEach(c=>{const el=document.getElementById("in_"+c.id),raw=c.type==="toggle"?(el.checked?1:0):+el.value;if(Math.abs(raw-c.raw0)>1e-9)q.set(c.id,String(+raw.toPrecision(8)));});
  if(I18N.lang==="id")q.set("lang","id");
  const qs=q.toString();try{history.replaceState(null,"",location.pathname+(qs?"?"+qs:""));}catch(e){}
}
function readURL(){
  const q=new URLSearchParams(location.search);let any=false;
  if(q.has("route")&&ROUTES.some(r=>r.id===q.get("route"))&&q.get("route")!==RT.id){useRoute(q.get("route"));stops.clear();DEFAULT_STOPS.forEach(x=>stops.add(x));buildRouteUI();}
  if(q.has("stops")){stops.clear();q.get("stops").split(",").forEach(x=>{if(OPT.includes(x))stops.add(x);});any=true;}
  CTLS.forEach(c=>{if(!q.has(c.id))return;const v=parseFloat(q.get(c.id));if(!isFinite(v))return;setCtl(c,c.type==="toggle"?v:Math.max(c.min,Math.min(c.max,v)));any=true;});
  return any;
}
document.getElementById("copyLink").addEventListener("click",()=>{writeURL();const n=document.getElementById("copyNote");const done=ok=>{n.textContent=ok?"copied":"copy the address bar";setTimeout(()=>n.textContent="",2500);};
  if(navigator.clipboard)navigator.clipboard.writeText(location.href).then(()=>done(true),()=>done(false));else done(false);});

// ---------- boot ----------
document.querySelectorAll("h2[data-ico]").forEach(h=>h.insertAdjacentHTML("afterbegin",ico(h.dataset.ico)));
buildControls();
CTLS.forEach(c=>{setCtl(c,c.def);const el=document.getElementById("in_"+c.id);c.raw0=c.type==="toggle"?c.def:+el.value;}); // raw0: the default as the range input snaps it
if(readURL())markCustom();else document.getElementById("presetNote").textContent=PRESETS[0].note;
update();
I18N.start();
