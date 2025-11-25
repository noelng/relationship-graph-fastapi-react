import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Upload, RefreshCw, ZoomIn, ZoomOut, Building2, User } from 'lucide-react';

// const API_BASE = 'http://localhost:8000/api';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export default function GraphExplorer() {
  const [entities, setEntities] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState('');
  const [expandedNodes, setExpandedNodes] = useState([]);
  const [graphData, setGraphData] = useState(null);
  const [stats, setStats] = useState(null);
  const [mode, setMode] = useState('interactive');
  const [depth, setDepth] = useState(2);
  const [uploading, setUploading] = useState(false);
  const svgRef = useRef(null);
  const simulationRef = useRef(null);

  const uploadFile = async (file) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setEntities(data.entities);
      
      const statsRes = await fetch(`${API_BASE}/stats`);
      const statsData = await statsRes.json();
      setStats(statsData);
    } catch (error) {
      alert('Error uploading file: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const loadGraph = async () => {
    if (!selectedEntity) return;

    try {
      let response;
      if (mode === 'interactive') {
        response = await fetch(`${API_BASE}/graph/interactive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity: selectedEntity,
            expanded_nodes: expandedNodes,
          }),
        });
      } else {
        response = await fetch(`${API_BASE}/graph/radial`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity: selectedEntity, depth }),
        });
      }
      const data = await response.json();
      setGraphData(data);
    } catch (error) {
      alert('Error loading graph: ' + error.message);
    }
  };

  useEffect(() => {
    if (selectedEntity) {
      setExpandedNodes([selectedEntity]);
    }
  }, [selectedEntity]);

  useEffect(() => {
    loadGraph();
  }, [selectedEntity, expandedNodes, mode, depth]);

  useEffect(() => {
    if (!graphData || !svgRef.current) return;

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove();

    const width = 1000;
    const height = 700;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // Add zoom
    const g = svg.append('g');
    
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);

    // Arrow markers
    svg.append('defs').selectAll('marker')
      .data(['arrow'])
      .join('marker')
      .attr('id', d => d)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', '#999')
      .attr('d', 'M0,-5L10,0L0,5');

    // Create simulation
    const simulation = d3.forceSimulation(graphData.nodes)
      .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40));

    simulationRef.current = simulation;

    // Draw links
    const link = g.append('g')
      .selectAll('g')
      .data(graphData.links)
      .join('g');

    link.append('path')
      .attr('stroke', d => d.color)
      .attr('stroke-width', 2)
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arrow)')
      .style('opacity', 0.8);

    link.append('text')
      .attr('font-size', 10)
      .attr('fill', '#666')
      .attr('text-anchor', 'middle')
      .text(d => d.relationship_sub_type);

    // Draw nodes
    const node = g.append('g')
      .selectAll('g')
      .data(graphData.nodes)
      .join('g')
      .style('cursor', d => d.expandable ? 'pointer' : 'default')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Node circles/icons
    node.each(function(d) {
      const nodeG = d3.select(this);
      
      if (d.type === 'person') {
        // Person icon
        nodeG.append('circle')
          .attr('r', d.size)
          .attr('fill', '#3b82f6')
          .attr('stroke', d.expanded ? '#000' : '#fff')
          .attr('stroke-width', d.expanded ? 3 : 1);
        
        nodeG.append('text')
          .attr('font-family', 'Arial')
          .attr('font-size', 20)
          .attr('text-anchor', 'middle')
          .attr('dy', 7)
          .attr('fill', '#fff')
          .text('👤');
      } else {
        // Company icon
        nodeG.append('circle')
          .attr('r', d.size)
          .attr('fill', '#10b981')
          .attr('stroke', d.expanded ? '#000' : '#fff')
          .attr('stroke-width', d.expanded ? 3 : 1);
        
        nodeG.append('text')
          .attr('font-family', 'Arial')
          .attr('font-size', 20)
          .attr('text-anchor', 'middle')
          .attr('dy', 7)
          .attr('fill', '#fff')
          .text('🏢');
      }
    });

    // Node labels
    node.append('text')
      .attr('dy', d => d.size + 15)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('font-weight', d => d.root ? 'bold' : 'normal')
      .text(d => d.label);

    // Click handler
    node.on('click', (event, d) => {
      event.stopPropagation();
      if (d.expandable && mode === 'interactive') {
        setExpandedNodes(prev => [...prev, d.id]);
      }
    });

    // Hover effects
    node.on('mouseenter', function(event, d) {
      if (d.expandable) {
        d3.select(this).select('circle')
          .transition()
          .duration(200)
          .attr('r', d.size * 1.2);
      }
    });

    node.on('mouseleave', function(event, d) {
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', d.size);
    });

    // Tooltips
    node.append('title')
      .text(d => {
        if (d.expandable) return `${d.label} (${d.type})\n👆 Click to expand`;
        if (d.expanded) return `${d.label} (${d.type})\n✓ Expanded`;
        return `${d.label} (${d.type})`;
      });

    // Update positions on tick
    simulation.on('tick', () => {
      link.select('path').attr('d', d => {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dr = Math.sqrt(dx * dx + dy * dy);
        return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
      });

      link.select('text')
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

  }, [graphData]);

  const handleReset = () => {
    if (selectedEntity) {
      setExpandedNodes([selectedEntity]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🔗 Relationship Graph Explorer
          </h1>
          <p className="text-gray-600">
            Interactive network visualization - Click nodes to expand relationships
          </p>
        </header>

        <div className="grid grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="col-span-1 space-y-4">
            {/* Upload */}
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Upload size={18} /> Upload Data
              </h2>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => e.target.files[0] && uploadFile(e.target.files[0])}
                className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                disabled={uploading}
              />
              {uploading && <p className="text-sm text-gray-500 mt-2">Uploading...</p>}
            </div>

            {/* Stats */}
            {stats && (
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="font-semibold mb-3">📊 Stats</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Nodes:</span>
                    <span className="font-semibold">{stats.node_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Edges:</span>
                    <span className="font-semibold">{stats.edge_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Density:</span>
                    <span className="font-semibold">{stats.density.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Mode */}
            {entities.length > 0 && (
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="font-semibold mb-3">🎨 Mode</h2>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="interactive"
                      checked={mode === 'interactive'}
                      onChange={(e) => setMode(e.target.value)}
                      className="text-blue-600"
                    />
                    <span className="text-sm">Interactive (Click to Expand)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="radial"
                      checked={mode === 'radial'}
                      onChange={(e) => setMode(e.target.value)}
                      className="text-blue-600"
                    />
                    <span className="text-sm">Radial Map</span>
                  </label>
                </div>

                {mode === 'radial' && (
                  <div className="mt-3">
                    <label className="text-sm text-gray-600">Depth: {depth}</label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={depth}
                      onChange={(e) => setDepth(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Legend */}
            {entities.length > 0 && (
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="font-semibold mb-3">🎨 Legend</h2>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Building2 size={16} className="text-green-600" />
                    <span>Company</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-blue-600" />
                    <span>Person</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-black"></div>
                    <span>Expanded</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="col-span-3">
            {entities.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <Upload size={48} className="mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Upload CSV to Begin</h3>
                <p className="text-gray-600 text-sm">
                  CSV must contain: entity_from, relationship_type, relationship_sub_type, entity_to
                </p>
              </div>
            ) : (
              <>
                {/* Controls */}
                <div className="bg-white rounded-lg shadow p-4 mb-4">
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Select Entity
                      </label>
                      <select
                        value={selectedEntity}
                        onChange={(e) => setSelectedEntity(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value="">Choose an entity...</option>
                        {entities.map(entity => (
                          <option key={entity} value={entity}>{entity}</option>
                        ))}
                      </select>
                    </div>
                    {mode === 'interactive' && selectedEntity && (
                      <button
                        onClick={handleReset}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md flex items-center gap-2"
                      >
                        <RefreshCw size={16} />
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Info */}
                {mode === 'interactive' && selectedEntity && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-blue-800">
                      💡 <strong>Click any node</strong> in the graph to expand and reveal its relationships!
                    </p>
                  </div>
                )}

                {/* Graph */}
                <div className="bg-white rounded-lg shadow p-4">
                  {!selectedEntity ? (
                    <div className="h-[700px] flex items-center justify-center text-gray-400">
                      Select an entity to view the graph
                    </div>
                  ) : !graphData ? (
                    <div className="h-[700px] flex items-center justify-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                  ) : (
                    <svg ref={svgRef} className="border border-gray-200 rounded"></svg>
                  )}
                </div>

                {/* Expanded Nodes Info */}
                {mode === 'interactive' && graphData && expandedNodes.length > 1 && (
                  <div className="bg-white rounded-lg shadow p-4 mt-4">
                    <h3 className="font-semibold mb-2">✅ Expanded: {expandedNodes.length} nodes</h3>
                    <div className="flex flex-wrap gap-2">
                      {expandedNodes.map(node => (
                        <span key={node} className="px-2 py-1 bg-green-100 text-green-800 text-sm rounded">
                          {node}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}