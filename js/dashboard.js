const log = console.log;
const rowColors = 
[
    "#b3d485","#da84ec","#bbe532","#ef85c0",
    "#6fda4c","#afaae6","#dfc32b","#73c3e2",
    "#ec9228","#74d4cb","#f48658","#5cdca9",
    "#ec9084","#6bd77d","#e0a2b5","#c6d04e",
    "#bbc2cc","#dbad4d","#9dcfa7","#d6b46f",
    "#b6cf64","#ccc2a7","#d6ba86"
];

//for loading files
const PromiseWrapper = function(d) {
    return new Promise(function(resolve) {
        d3.json(d, function(p) { resolve(p); });
    });
};

//dc.js modules
const sunBurst = dc.sunburstChart("#sun-burst");
const bar = dc.barChart("#bar-chart");
const bubble = dc.bubbleChart("#bubble-chart");
const row = dc.rowChart("#row-chart");
const table = dc_datatables.datatable("#data-table");
const rowSels = dc.selectMenu("#sel-departments");
const barSels = dc.selectMenu("#sel-years");
const bubbleSels = dc.selectMenu("#sel-fund-types");
const sunBurstSels = dc.selectMenu("#sel-branch-programs");
const recordCounter = dc.dataCount("#records-count");

//load data json files
Promise
    .all([
        PromiseWrapper("json-files/expenditures2(May-22-2018).json"),
        PromiseWrapper("json-files/sunburst-colors.json")
    ])
    .then((resolve) => viz(resolve[0], resolve[1]));

function viz(response, sunburstColors) {

    //color scales
    const departments = [...new Set(response.map(d => d.department))];
    const branches = [...new Set(response.map(d => d.branch))];
    const programs = [...new Set(response.map(d => d.program))];
    const branProgs = [branches, programs].reduce((acc, curArr) => acc.concat(curArr),[]);
    const sunBurstColorScale = d3.scaleOrdinal().domain(branProgs).range(sunburstColors);
    const rowColorScale = d3.scaleOrdinal().domain(departments).range(rowColors);

    let ndx = crossfilter(response);

    //dimensions
    let branProgDim = ndx.dimension(d => [d["branch"], d["program"]]);
    let departDim = ndx.dimension(d => d["department"]);
    let fundTypeDim = ndx.dimension(d => d["fund_type"]);
    let budgetYrDim = ndx.dimension(d => d["budget_year"]);

    //groups
    let branProgGrp = branProgDim.group().reduceSum(d => d["budget"]);
    let departGrp = departDim.group().reduceSum(d => d["budget"]);
    let fundTypeGrp = fundTypeDim.group().reduceSum(d => d["budget"]);
    let budgetYrGrp = budgetYrDim.group().reduceSum(d => d["budget"]);
    let sumofAllExpends = ndx.groupAll().reduceSum(d => d["budget"]);

    //for bubble attributes
    const fundTypeValues = fundTypeGrp.all().map(d => d.value).sort((a, b) => a - b);
    const fundTypeKeys = fundTypeGrp.all().map(d => d).sort((a, b) => b.value - a.value).map(d => d.key);
    const fundTypeMinMax = [fundTypeValues[0], fundTypeValues[fundTypeValues.length - 1]];

    //title, multiple, order assignment, and customFilter func for each select menu
    const selcts = [rowSels, barSels, bubbleSels, sunBurstSels].forEach(sel => {
            sel
                .title(d => `${d.key}: $${d.value.toLocaleString()}`)
                .multiple(true)
                .order((a, b) => b.value > a.value ? 1 : a.value > b.value ? -1 : 0)
                .on("filtered." + sel.chartID(), sumUpdater);
        });

    //title, viewBoxResizing, and customFilter func for each chart
    const charts = [row, bar, bubble, sunBurst].forEach(chart => {
            chart
                .title(d => `${d.key}: $${d.value.toLocaleString()}`)
                .useViewBoxResizing(true)
                .on("filtered." + chart.chartID(), sumUpdater);
    });

    recordCounter.dimension(ndx)
        .group(ndx.groupAll())
        .html({
            some: '<strong>%filter-count</strong> selected out of <strong>%total-count</strong> records.',
            all: 'All records selected. Please click on the chart(s) to apply filters.'
        });

    row
        .height(row.width() * 0.9)
        .dimension(departDim)
        .margins({
            top: row.width() * 0.024, left: row.width() * 0.012, 
            bottom: row.width() * 0.043, right: row.width() * 0.024
        })
        .elasticX(true)
        .colors(rowColorScale)
        .colorAccessor((d, i) => d.key)
        .group(departGrp);
    row.xAxis().ticks(4); 

    bar
        .height(bar.width() * 0.25)
        .margins({
            top: bar.width() * 0.017, bottom: bar.width() * 0.04,
            right: bar.width() * 0.033, left: bar.width() * 0.18
        })
        .dimension(budgetYrDim)
        .elasticY(true)
        .group(budgetYrGrp)
        .x(d3.scaleBand())
        .barPadding(0.07)
        .outerPadding(0.1)
        .xUnits(dc.units.ordinal);
    bar.yAxis().ticks(4); 
    
    bubble
        .height(bubble.width() * 0.506)
        .margins(
            {
                top: bubble.width() * 0.121, bottom: bubble.width() * 0.097,
                left:-(bubble.width() * 0.0121), right: bubble.width() * 0.169
            }
        )
        .dimension(fundTypeDim)
        .elasticY(true)
        .label(d => `${d.key}: $${d.value.toLocaleString()}`)
        .group(fundTypeGrp)
        .clipPadding(10000)
        .colors(["#fbb4ae", "#b3cde3", "#ccebc5", "#decbe4"])
        .colorDomain([1, fundTypeKeys.length])
        .colorAccessor((d, i) => i + 1)
        .keyAccessor((d, i) => fundTypeKeys.indexOf(d.key) + 1)
        .valueAccessor(d => d.value)
        .radiusValueAccessor(d => d.value)
        .maxBubbleRelativeSize(0.03)
        .x(d3.scaleLinear().domain([0, 4]))
        .r(d3.scaleLinear().domain([0, fundTypeMinMax[0]]));

    sunBurst
        .height(sunBurst.width() * 0.897)
        .label(d => d.budget, false)
        .dimension(branProgDim)
        .group(branProgGrp)
        .colors(sunBurstColorScale)
        .colorAccessor((d, i) => d.key);

    table
        .dimension(budgetYrDim )
        .group(d => d["budget"])
        .size(10)
        .columns([
            {
                label: "Department",
                format: d => d["department"]
            },
            {
                label: "Branch",
                format: d => d["branch"]
            },
            {
                label: "Program",
                format: d => d["program"]
            },
            {
                label: "Fund Type",
                format: d => d["fund_type"]
            },
            {
                label: "Budget Year",
                format: d => d["budget_year"]
            },
            {
                label: "Budget",
                format: d => `$${d["budget"].toLocaleString()}`
            }
        ]);

    rowSels
        .dimension(departDim)
        .group(departGrp)
        .numberVisible(11);   

    barSels
        .dimension(budgetYrDim)
        .group(budgetYrGrp)
        .numberVisible(5); 

    bubbleSels
        .dimension(fundTypeDim)
        .group(fundTypeGrp)
        .numberVisible(6);  

    sunBurstSels
        .dimension(branProgDim)
        .group(branProgGrp)
        .numberVisible(11);   

    dc.renderAll();

    const texts = [
            {
                id:"stats-title", 
                x: bubble.width() * 0.40, 
                y: bubble.height() * 0.15, 
                content: "Sum:", 
                "text-anchor": "start",
                "font-size": Math.round(bubble.height() * 0.065, 1)
            },
            {
                id: "sum",
                x: bubble.width() * 0.5,
                y: bubble.height() * 0.15, 
                content: "$"+sumofAllExpends.value().toLocaleString(),
                "text-anchor": "start",
                "font-size": Math.round(bubble.height() * 0.11, 1)
            }
        ];

    d3.select("#bubble-chart > svg")
      .selectAll("text.stats")
    .data(texts).enter()
      .append("text")
        .classed("stats", true)
        .style("font-size", d => d["font-size"])
        .text(d => d.content)
        .attr("id", d => d.id)
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("text-anchor", d => d["text-anchor"]);

    // const svg = d3.select("#sun-burst > svg");
    // const width = svg.node().getBoundingClientRect().width;
    // const height = svg.node().getBoundingClientRect().height;
    // const sunBurstG = d3.select("#sun-burst > svg > g");

    // const sunBurstZoom = d3.zoom().scaleExtent([1, 10]).on("zoom.sunburst", function() {
    //     svg.attr("viewBox","" + (-width / 2) + " " + (-height / 2) + " " + width + " " + height);
    //     return sunBurstG.attr("transform", d3.event.transform);
    // });

    // svg.call(sunBurstZoom);

    function sumUpdater() {
        //update the sum text
        d3.select("#sum").html( '$'+sumofAllExpends.value().toLocaleString() );
    };
};

//--------------- W3 Schools Helper Functions 
function w3_open() {
document.getElementById("main").style.marginLeft = "55%";
document.getElementById("mySidebar").style.width = "53%";
document.getElementById("mySidebar").style.height = "90%";
document.getElementById("mySidebar").style.display = "block";
};

function w3_close() {
document.getElementById("main").style.marginLeft = "0%";
document.getElementById("mySidebar").style.display = "none";
document.getElementById("openNav").style.display = "inline-block";
};

function myAccFunc(id) {
const x = document.getElementById(id);
if (x.className.indexOf("w3-show") == -1) {
    x.className += " w3-show";
    x.previousElementSibling.className += " w3-darkblue";
} else { 
    x.className = x.className.replace(" w3-show", "");
    x.previousElementSibling.className = 
    x.previousElementSibling.className.replace(" w3-darkblue", "");
}
};
//--------------- W3 Schools Helper Functions 