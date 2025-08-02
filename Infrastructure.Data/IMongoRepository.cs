using Domain;
using System.Threading.Tasks;

namespace Infrastructure.Data
{
    public interface IMongoRepository<T> : IRepository<T> where T : BaseDataObject
    {
        Task<T> GetByIdAsync(string id);
        Task<T> CreateAsync(T entity);
        Task InsertAsync(T entity);
        Task UpdateAsync(T entity);
        Task PatchAsync(string id, object updates);
        Task DeleteAsync(string id);
    }
}