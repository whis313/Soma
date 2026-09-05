import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let ignore = false

    async function loadMenu() {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .order('id')

      if (ignore) return

      if (error) {
        setError(error.message)
      } else {
        setMenuItems(data)
      }

      setLoading(false)
    }

    loadMenu()

    return () => {
      ignore = true
    }
  }, [])

  function addToCart(item) {
    setCart((currentCart) => ({
      ...currentCart,
      [item.id]: (currentCart[item.id] || 0) + 1
    }))
  }

  function removeFromCart(item) {
    setCart((currentCart) => {
      const newCart = { ...currentCart }

      if (newCart[item.id] > 1) {
        newCart[item.id] -= 1
      } else {
        delete newCart[item.id]
      }

      return newCart
    })
  }

  const cartItems = menuItems.filter(
    (item) => cart[item.id]
  )

  const total = cartItems.reduce(
    (sum, item) => sum + Number(item.price) * cart[item.id],
    0
  )

  return (
    <div className="app">
      <header>
        <h1>Chowly</h1>
        <p>Order your meal</p>
      </header>

      <main>
        <section>
          <h2>Menu</h2>

          {loading && <p>Loading menu...</p>}

          {error && (
            <p className="error">
              Error loading menu: {error}
            </p>
          )}

          <div className="menu">
            {menuItems.map((item) => (
              <div className="menu-card" key={item.id}>
                <h3>{item.name}</h3>

                <p className="category">
                  {item.category}
                </p>

                <p>
                  ₦{Number(item.price).toLocaleString()}
                </p>

                <p>
                  Preparation: {item.preparation_time} min
                </p>

                <button onClick={() => addToCart(item)}>
                  Add to Order
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside className="cart">
          <h2>Your Order</h2>

          {cartItems.length === 0 ? (
            <p>Your order is empty.</p>
          ) : (
            <>
              {cartItems.map((item) => (
                <div className="cart-item" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      ₦{Number(item.price).toLocaleString()} ×{' '}
                      {cart[item.id]}
                    </p>
                  </div>

                  <div>
                    <button onClick={() => removeFromCart(item)}>
                      −
                    </button>

                    <span>{cart[item.id]}</span>

                    <button onClick={() => addToCart(item)}>
                      +
                    </button>
                  </div>
                </div>
              ))}

              <hr />

              <h3>
                Total: ₦{total.toLocaleString()}
              </h3>

              <button className="order-button">
                Place Order
              </button>
            </>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App