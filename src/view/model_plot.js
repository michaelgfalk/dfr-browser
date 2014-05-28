/*global view, VIS, set_view, topic_hash, d3 */
"use strict";

view.model.plot = function (param) {
    var spec, svg, cloud_size, circle_radius, range_padding,
        coords,
        domain_x, domain_y,
        scale_x, scale_y, scale_size, scale_stroke,
        gs, translation, zoom,
        n = param.words.length;

    // TODO need visual indication of stroke ~ alpha mapping

    // TODO really the best way to size this plot?
    spec = {
        w: VIS.model_view.w,
        h: Math.floor(VIS.model_view.w / VIS.model_view.aspect),
        m: {
            left: 0,
            right: 0,
            top: 0,
            bottom: 0
        }
    };

    svg = view.plot_svg("#model_view_plot", spec);

    // rough attempt to fill total circle area in plot window 
    // 2.25 rather than 2 is pure fudge factor
    circle_radius = Math.floor(spec.w /
            (2.25 * Math.sqrt(VIS.model_view.aspect * n)));
    // Allow the cloud to spill outside circle a little
    cloud_size = Math.floor(circle_radius * 2.1);
    range_padding = 1.1 * circle_radius;

    // zoom-target rectangle
    svg.selectAll("rect.bg")
        .data([1])
        .enter().append("rect")
            .attr("width", spec.w)
            .attr("height", spec.h)
            .classed("bg", true);

    if (param.type === "scaled") {
        coords = param.scaled.map(function (p, j) {
            return {
                x: p[0],
                y: p[1],
                t: j,
                r: circle_radius
            };
        });
    } else {
        // default to grid
        coords = view.model.grid_coords(n)
            .map(function (p, j) {
                return {
                    x: p.x,
                    y: p.y,
                    t: j,
                    r: circle_radius
                };
        });
    }

    domain_x = d3.extent(coords, function (d) { return d.x; });
    domain_y = d3.extent(coords, function (d) { return d.y; });


    scale_x = d3.scale.linear()
        .domain(domain_x)
        .range([range_padding, spec.w - range_padding]);

    scale_y = d3.scale.linear()
        .domain(domain_y)
        .range([spec.h - range_padding, range_padding]);

    scale_size = d3.scale.sqrt()
        .domain([0, 1])
        .range(VIS.model_view.size_range);

    scale_stroke = d3.scale.linear()
        .domain([0,d3.max(param.topic_totals)])
        .range([0,VIS.model_view.stroke_range]);

    gs = svg.selectAll("g")
        .data(coords, function (p) { return p.t; });

    gs.enter().append("g")
        .each(function (p, t) {
            var g = d3.select(this),
                max_wt = param.words[t][0].weight,
                wds = param.words[t].map(function (w) {
                    return {
                        text: w.word,
                        size: Math.floor(scale_size(w.weight / max_wt))
                    };
                }),
                up, down, toggle, i;

            g.append("circle")
                .attr("cx", 0)
                .attr("cy", 0)
                .attr("r", function (p) {
                    return p.r;
                })
                .classed("topic_cloud", true)
                .attr("stroke-width", function (p) {
                    return scale_stroke(param.topic_totals[p.t]);
                })
                .on("click", function (p) {
                    if (!d3.event.shiftKey) {
                        set_view(topic_hash(t));
                    }
                })
                .on("mouseover", function (p) {
                    gs.sort(function (a, b) {
                        if (a.t === b.t) {
                            return 0;
                        }

                        if (a.t === t) {
                            return 1;
                        }

                        if (b.t === t) {
                            return -1;
                        }

                        // otherwise
                        return d3.ascending(a.t, b.t);
                    })
                        .order();
                })
                .on("mouseout",function() {
                    gs.sort(function (a, b) {
                            return d3.ascending(a.t, b.t);
                        })
                        .order();
                });

            up = 0;
            down = 0;
            toggle = false;
            for (i = 0; i < wds.length; i += 1, toggle = !toggle) {
                if (toggle) {
                    wds[i].y = up;
                    up -= wds[i].size;
                } else {
                    down += wds[i].size;
                    wds[i].y = down;
                }
                if (up - cloud_size / 2 < wds[i].size
                        && down > cloud_size / 2) {
                    break;
                }
            }

            g.selectAll("text")
                .data(wds.slice(0, i))
                .enter().append("text")
                    .text(function (wd) {
                        return wd.text;
                    })
                    .style("font-size", function (wd) {
                        return wd.size + "px";
                    })
                    .attr("x", 0)
                    .attr("y", function (wd) {
                        return wd.y;
                    })
                    .on("click", function (wd) {
                        set_view(topic_hash(t));
                    }) 
                    .classed("topic_label", true);
                    // TODO coloring
        });

    translation = function (p) {
        var result = "translate(" + scale_x(p.x);
        result += "," + scale_y(p.y) + ")";
        return result;
    };

    if (gs.enter().empty()) {
        gs.transition()
            .duration(1000)
            .attr("transform", translation);
    } else {
        // on first setup, no gratuitous translation
        gs.attr("transform", translation);
    }

    // TODO zoom circle sizes and add words in but this makes some
    // complications for the scaled view where the main use of zoom is to
    // see overlapping circles.
    // TODO and then, re-enable zoom in the grid view.

    if (param.type === "scaled") {
        zoom = d3.behavior.zoom()
            .x(scale_x)
            .y(scale_y)
            .scaleExtent([1, 10])
            .on("zoom", function () {
                if (VIS.zoom_transition) {
                    gs.transition()
                        .duration(1000)
                        .attr("transform", translation);
                    VIS.zoom_transition = false;
                } else {
                    gs.attr("transform", translation);
                }
            });

        // zoom reset button
        d3.select("button#reset_zoom")
            .on("click", function () {
                VIS.zoom_transition = true;
                zoom.translate([0, 0])
                    .scale(1)
                    .event(svg);
            });

        zoom(svg);
    }
};

view.model.grid_coords = function (n) {
    var n_col = Math.floor(Math.sqrt(VIS.model_view.aspect * n)),
        n_row = Math.floor(n / n_col),
        remain = n - n_row * n_col,
        remain_odd = Math.max(remain - Math.floor(n_row / 2), 0),
        cols,
        vskip,
        i, j,
        result = [];

    // for circles of equal size, closest possible packing is hexagonal grid
    // centers are spaced 1 unit apart on horizontal, sqrt(3) / 2 on vertical.
    // Alternate rows are displaced 1/2 unit on horizontal.
    vskip = Math.sqrt(3.0) / 2.0;

    // if n is not exactly n_row * n_col, we'll do our best sticking
    // things on the right-side margin

    for (i = 0; i < n_row; i += 1) {
        cols = n_col;
        if (remain > 0) {
            remain -= 1;
            if (i % 2 === 0) {
                cols = n_col + 1;
            } else {
                if (remain_odd > 0) {
                    remain_odd -= 1;
                    cols = n_col + 1;
                }
            }
        }

        for (j = 0; j < cols; j += 1) {
            result.push({
                x: j + 0.5 + ((i % 2 === 0) ? 0 : 0.5),
                y: (n_row - i) * vskip + 0.5 });
        }
    }

    return result;
};
