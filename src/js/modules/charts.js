import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

Chart.defaults.color='#8fa0ba';
Chart.defaults.borderColor='rgba(38,48,74,.6)';
Chart.defaults.font.family='Inter, system-ui, sans-serif';

export function createTopChart(canvas, topNums, freq){
  if(!canvas) return null;
  return new Chart(canvas, {
    type:'bar',
    data:{
      labels: topNums.map(n=>'P'+n),
      datasets:[{ data: topNums.map(n=>freq[n]), backgroundColor: topNums.map((_,i)=> i<3?'#f6b21b':'#31405f'), borderRadius:8, borderSkipped:false }]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:false}, tooltip:{backgroundColor:'#151b2c', titleColor:'#e6ebf4', bodyColor:'#8fa0ba', borderColor:'#26304a', borderWidth:1}},
      scales:{ y:{grid:{color:'rgba(38,48,74,.5)'}, ticks:{precision:0}}, x:{grid:{display:false}} }
    }
  });
}

export function createClassChart(canvas, hot, neu, cold){
  return new Chart(canvas, {
    type:'doughnut',
    data:{ labels:['Chauds','Neutres','Froids'], datasets:[{ data:[hot,neu,cold], backgroundColor:['#f97316','#31405f','#38bdf8'], borderWidth:0 }] },
    options:{ responsive:true, plugins:{legend:{position:'bottom', labels:{boxWidth:12}}}, cutout:'62%' }
  });
}

export function createLineChart(canvas, labels, data){
  return new Chart(canvas, {
    type:'line',
    data:{ labels, datasets:[{ data, borderColor:'#f6b21b', backgroundColor:'rgba(246,178,27,.15)', fill:true, tension:.35, pointRadius:2, borderWidth:2 }] },
    options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ y:{grid:{color:'rgba(38,48,74,.5)'}}, x:{grid:{display:false}, ticks:{maxTicksLimit:8}} } }
  });
}

export function createHorizBar(canvas, labels, data, colors){
  return new Chart(canvas, {
    type:'bar',
    data:{ labels, datasets:[{ data, backgroundColor: colors||'#f6b21b', borderRadius:6 }] },
    options:{ indexAxis:'y', responsive:true, plugins:{legend:{display:false}}, scales:{ x:{grid:{color:'rgba(38,48,74,.5)'}}, y:{grid:{display:false}} } }
  });
}

export function createEquityChart(canvas, equity, netPositive){
  return new Chart(canvas, {
    type:'line',
    data:{ labels: equity.map((_,i)=>i), datasets:[{ data:equity, borderColor: netPositive?'#22c55e':'#ef4444', backgroundColor:'rgba(34,197,94,.12)', fill:true, pointRadius:0, tension:.2, borderWidth:1.5 }] },
    options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ y:{grid:{color:'rgba(38,48,74,.5)'}}, x:{display:false} } }
  });
}
