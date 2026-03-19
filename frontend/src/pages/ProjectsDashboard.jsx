import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { parseTitle } from '../utils/parseTitle'

const API = import.meta.env.VITE_API_URL

function buildTree(projects) {
  const tree = {}
  for (const project of projects) {
    const { brand, type, cut } = parseTitle(project.title)
    if (!tree[brand]) tree[brand] = {}
    if (!tree[brand][type]) tree[brand][type] = []
    tree[brand][type].push({ cut, id: project.id })
  }
  return tree
}

function Chevron({ open }) {
  return (
    <svg
      className={`chevron${open ? ' chevron-open' : ''}`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="5,3 11,8 5,13" />
    </svg>
  )
}

export default function ProjectsDashboard() {
  const [projects, setProjects] = useState([])
  const [openBrands, setOpenBrands] = useState(new Set())
  const [openTypes, setOpenTypes] = useState(new Set())
  const navigate = useNavigate()

  useEffect(() => {
    axios.get(`${API}/projects`).then(({ data }) => setProjects(data))
  }, [])

  function toggleBrand(brand) {
    setOpenBrands(prev => {
      const next = new Set(prev)
      next.has(brand) ? next.delete(brand) : next.add(brand)
      return next
    })
  }

  function toggleType(key) {
    setOpenTypes(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const tree = buildTree(projects)
  const brands = Object.keys(tree).sort()

  return (
    <div className="page dashboard-body">
      <h1 className="dashboard-heading">Projects</h1>

      {brands.length === 0 ? (
        <p className="dashboard-empty">
          No projects yet. Upload your first video to get started.
        </p>
      ) : (
        brands.map(brand => {
          const types = tree[brand]
          const totalCuts = Object.values(types).reduce((sum, cuts) => sum + cuts.length, 0)
          const brandOpen = openBrands.has(brand)

          return (
            <div key={brand} className="brand-folder">
              <div className="folder-row" onClick={() => toggleBrand(brand)}>
                <Chevron open={brandOpen} />
                <span className="folder-name">{brand}</span>
                <span className="count-badge">{totalCuts}</span>
              </div>

              <div className={`folder-children${brandOpen ? ' folder-children-open' : ''}`}>
                {Object.keys(types).sort().map(type => {
                  const typeKey = `${brand}__${type}`
                  const typeOpen = openTypes.has(typeKey)
                  const cuts = types[type]

                  return (
                    <div key={type}>
                      <div className="type-row" onClick={() => toggleType(typeKey)}>
                        <Chevron open={typeOpen} />
                        <span className="type-name">{type}</span>
                      </div>

                      <div className={`folder-children${typeOpen ? ' folder-children-open' : ''}`}>
                        {cuts.map(({ cut, id }) => (
                          <div
                            key={id}
                            className="cut-row"
                            onClick={() => navigate(`/review/${id}`)}
                          >
                            {cut}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
