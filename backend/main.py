# backend/main.py
"""
FastAPI Backend for Relationship Graph Visualization

Install: pip install fastapi uvicorn pandas networkx python-multipart
Run: uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import networkx as nx
import io
from typing import List, Dict, Set, Optional

app = FastAPI(title="Relationship Graph API")

# Enable CORS for React frontend
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:3000", "http://localhost:5173"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (use database in production)
graph_store = {
    "graph": None,
    "entity_types": {},
    "data": None
}

class ExpandRequest(BaseModel):
    entity: str
    expanded_nodes: List[str]

class GraphResponse(BaseModel):
    nodes: List[Dict]
    links: List[Dict]
    expandable_nodes: List[str]

def detect_entity_type(name: str) -> str:
    """Detect if entity is person or company"""
    person_keywords = ['mr.', 'mrs.', 'ms.', 'dr.', 'prof.']
    company_keywords = ['inc', 'corp', 'ltd', 'llc', 'co.', 'company', 'group', 'holdings', 'pte']
    
    name_lower = name.lower()
    
    if any(keyword in name_lower for keyword in person_keywords):
        return 'person'
    if any(keyword in name_lower for keyword in company_keywords):
        return 'company'
    
    return 'company'

def get_relationship_color(relationship_sub_type: str) -> str:
    """Get color for relationship sub-type"""
    color_map = {
        'direct_ownership': '#ef4444',
        'indirect_ownership': '#f97316',
        'majority_shareholder': '#dc2626',
        'minority_shareholder': '#fb923c',
        'ceo': '#8b5cf6',
        'cfo': '#a78bfa',
        'director': '#c084fc',
        'board_member': '#d8b4fe',
        'employee': '#10b981',
        'consultant': '#34d399',
        'investment': '#3b82f6',
        'venture_capital': '#60a5fa',
        'private_equity': '#2563eb',
        'control': '#ec4899',
        'subsidiary': '#f43f5e',
        'shareholder': '#f87171',
        'auditor': '#22d3ee',
        'multiple': '#000000',
        'owner': '#dc2626',
    }
    
    sub_type_lower = str(relationship_sub_type).lower().replace(' ', '_')
    return color_map.get(sub_type_lower, f'hsl({hash(relationship_sub_type) % 360}, 70%, 50%)')

@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)):
    """Upload and process CSV file"""
    try:
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode('utf-8')))
        
        # Validate columns
        required_cols = ['entity_from', 'relationship_type', 'relationship_sub_type', 'entity_to']
        if not all(col in df.columns for col in required_cols):
            raise HTTPException(status_code=400, detail=f"CSV must contain: {required_cols}")
        
        # Clean data
        df = df.dropna(subset=['entity_from', 'entity_to'])
        df['entity_from'] = df['entity_from'].str.strip()
        df['entity_to'] = df['entity_to'].str.strip()
        
        # Build graph
        G = nx.DiGraph()
        entity_types = {}
        
        # Detect entity types
        if 'entity_type_from' in df.columns and 'entity_type_to' in df.columns:
            for _, row in df.iterrows():
                entity_types[row['entity_from']] = row.get('entity_type_from', 'company')
                entity_types[row['entity_to']] = row.get('entity_type_to', 'company')
        else:
            for _, row in df.iterrows():
                entity_types[row['entity_from']] = detect_entity_type(row['entity_from'])
                entity_types[row['entity_to']] = detect_entity_type(row['entity_to'])
        
        for _, row in df.iterrows():
            G.add_edge(
                row['entity_from'],
                row['entity_to'],
                relationship_type=row['relationship_type'],
                relationship_sub_type=row.get('relationship_sub_type', '')
            )
        
        # Store in memory
        graph_store["graph"] = G
        graph_store["entity_types"] = entity_types
        graph_store["data"] = df
        
        entities = sorted(list(G.nodes()))
        
        return {
            "success": True,
            "entities": entities,
            "node_count": G.number_of_nodes(),
            "edge_count": G.number_of_edges()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/entities")
async def get_entities():
    """Get list of all entities"""
    if graph_store["graph"] is None:
        raise HTTPException(status_code=400, detail="No graph loaded")
    
    G = graph_store["graph"]
    return {"entities": sorted(list(G.nodes()))}

@app.post("/api/graph/interactive")
async def get_interactive_graph(request: ExpandRequest) -> GraphResponse:
    """Get graph data for interactive expansion"""
    if graph_store["graph"] is None:
        raise HTTPException(status_code=400, detail="No graph loaded")
    
    G = graph_store["graph"]
    entity_types = graph_store["entity_types"]
    
    if request.entity not in G:
        raise HTTPException(status_code=404, detail="Entity not found")
    
    expanded_nodes = set(request.expanded_nodes)
    expanded_nodes.add(request.entity)
    
    # Get nodes to show
    nodes_to_show = set()
    edges_to_show = []
    available_to_expand = set()
    
    for node in expanded_nodes:
        if node in G:
            nodes_to_show.add(node)
            neighbors = set(G.successors(node)) | set(G.predecessors(node))
            nodes_to_show.update(neighbors)
            available_to_expand.update(neighbors - expanded_nodes)
            
            for neighbor in G.successors(node):
                edges_to_show.append((node, neighbor))
            for neighbor in G.predecessors(node):
                edges_to_show.append((neighbor, node))
    
    # Build response
    nodes = []
    for node in nodes_to_show:
        entity_type = entity_types.get(node, 'company')
        is_expanded = node in expanded_nodes
        is_root = node == request.entity
        can_expand = node in available_to_expand
        
        nodes.append({
            "id": node,
            "label": node,
            "type": entity_type,
            "expanded": is_expanded,
            "root": is_root,
            "expandable": can_expand,
            "size": 35 if is_root else (28 if is_expanded else 25)
        })
    
    links = []
    for source, target in edges_to_show:
        if source in nodes_to_show and target in nodes_to_show:
            edge_data = G.get_edge_data(source, target)
            if edge_data:
                links.append({
                    "source": source,
                    "target": target,
                    "relationship_type": edge_data.get('relationship_type', ''),
                    "relationship_sub_type": edge_data.get('relationship_sub_type', ''),
                    "color": get_relationship_color(edge_data.get('relationship_sub_type', ''))
                })
    
    return GraphResponse(
        nodes=nodes,
        links=links,
        expandable_nodes=sorted(list(available_to_expand))
    )

@app.post("/api/graph/radial")
async def get_radial_graph(entity: str, depth: int = 2):
    """Get radial graph data"""
    if graph_store["graph"] is None:
        raise HTTPException(status_code=400, detail="No graph loaded")
    
    G = graph_store["graph"]
    entity_types = graph_store["entity_types"]
    
    if entity not in G:
        raise HTTPException(status_code=404, detail="Entity not found")
    
    # Get subgraph
    nodes_set = {entity}
    for d in range(depth):
        current_layer = list(nodes_set)
        for node in current_layer:
            nodes_set.update(G.successors(node))
            nodes_set.update(G.predecessors(node))
    
    # Build response
    nodes = []
    for node in nodes_set:
        entity_type = entity_types.get(node, 'company')
        is_center = node == entity
        
        nodes.append({
            "id": node,
            "label": node,
            "type": entity_type,
            "expanded": True,
            "root": is_center,
            "expandable": False,
            "size": 35 if is_center else 25
        })
    
    links = []
    for source in nodes_set:
        for target in G.successors(source):
            if target in nodes_set:
                edge_data = G.get_edge_data(source, target)
                links.append({
                    "source": source,
                    "target": target,
                    "relationship_type": edge_data.get('relationship_type', ''),
                    "relationship_sub_type": edge_data.get('relationship_sub_type', ''),
                    "color": get_relationship_color(edge_data.get('relationship_sub_type', ''))
                })
    
    return {"nodes": nodes, "links": links}

@app.get("/api/stats")
async def get_graph_stats():
    """Get graph statistics"""
    if graph_store["graph"] is None:
        raise HTTPException(status_code=400, detail="No graph loaded")
    
    G = graph_store["graph"]
    
    return {
        "node_count": G.number_of_nodes(),
        "edge_count": G.number_of_edges(),
        "density": nx.density(G)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
